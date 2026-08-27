"""Channel lifecycle + reader thread for the /news demo.

Multiple viewers can join the same Agora channel to watch a LemonSlice
avatar (Leila) read out rolling news headlines. The first joiner spins
up the ConvoAI agent and a background reader thread that polls feeds
and pushes each item through Agora's /speak REST endpoint. The last
leaver tears both down. A heartbeat sweeper handles tabs that closed
without firing the unload beacon.

State is in-memory in the Flask process — for a multi-process gunicorn
deployment this would need a shared store, but the single-process
local_server.py here is fine.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Callable
from uuid import uuid4

from . import news_feed

log = logging.getLogger(__name__)

# Seconds a viewer session stays alive without a heartbeat before the
# sweeper drops it. Tabs heartbeat every 15 s; 60 s gives 4 grace
# windows for transient network blips.
SESSION_TIMEOUT_S = 60
# How often the sweeper runs.
SWEEP_INTERVAL_S = 10
# Quiet gap between consecutive headlines, as specified.
INTER_ITEM_GAP_S = 5
# If next_unspoken_items returns nothing (timeline exhausted vs. our
# reread cooldown), wait this long before checking again.
EMPTY_FEED_BACKOFF_S = 30
# Pre-warm: how long after start before the first headline (lets the
# greeting finish + the avatar tile settle).
WARMUP_S = 8


@dataclass
class ChannelState:
    channel: str
    profile: str
    agent_id: str | None = None
    constants: dict = field(default_factory=dict)
    sessions: dict[str, float] = field(default_factory=dict)
    reader: threading.Thread | None = None
    stop_event: threading.Event = field(default_factory=threading.Event)
    started_at: float = field(default_factory=time.time)
    last_spoken_text: str | None = None
    speak_count: int = 0


# Registry — keyed by channel name.
_channels: dict[str, ChannelState] = {}
_lock = threading.RLock()

# Sweeper thread is shared across all channels.
_sweeper_started = False
_sweeper_lock = threading.Lock()


def _ensure_sweeper(speak_fn: Callable, hangup_fn: Callable) -> None:
    """Start the background session sweeper on first use."""
    global _sweeper_started
    with _sweeper_lock:
        if _sweeper_started:
            return
        _sweeper_started = True
    t = threading.Thread(
        target=_sweeper_loop,
        args=(speak_fn, hangup_fn),
        name="news-sweeper",
        daemon=True,
    )
    t.start()


def _sweeper_loop(speak_fn: Callable, hangup_fn: Callable) -> None:
    while True:
        time.sleep(SWEEP_INTERVAL_S)
        try:
            now = time.time()
            with _lock:
                snapshot = list(_channels.items())
            for channel, state in snapshot:
                stale = [sid for sid, ts in state.sessions.items() if (now - ts) > SESSION_TIMEOUT_S]
                for sid in stale:
                    log.info("[news] dropping stale session %s on channel=%s (last_seen=%.0fs ago)",
                             sid, channel, now - state.sessions[sid])
                    state.sessions.pop(sid, None)
                if not state.sessions:
                    log.info("[news] no remaining sessions on channel=%s — shutting down", channel)
                    _shutdown_channel(channel, hangup_fn)
        except Exception as e:  # noqa: BLE001 — sweeper must never die
            log.exception("[news] sweeper iteration failed: %s", e)


def _say(*args) -> None:
    """Use print so reader output lands in `pm2 logs simple-backend`
    (Flask suppresses INFO-level logging.* calls by default)."""
    print("[news]", *args, flush=True)


def _reader_loop(channel: str, speak_fn: Callable) -> None:
    """Per-channel reader: pulls fresh headlines and speaks each."""
    _say(f"reader started for channel={channel}")
    state = _channels[channel]
    # Initial warmup so the greeting finishes before we start.
    state.stop_event.wait(timeout=WARMUP_S)
    while not state.stop_event.is_set():
        items = news_feed.next_unspoken_items(channel, n=5)
        if not items:
            _say(f"no fresh items for channel={channel}, sleeping {EMPTY_FEED_BACKOFF_S}s")
            state.stop_event.wait(timeout=EMPTY_FEED_BACKOFF_S)
            continue
        for item in items:
            if state.stop_event.is_set():
                break
            if not state.agent_id:
                break
            text = news_feed.speak_text_for(item)
            try:
                result = speak_fn(state.agent_id, text, state.constants, "APPEND")
                ok = bool(result.get("success"))
                status_code = result.get("status_code")
                body = (result.get("response") or "")[:200]
            except Exception as e:  # noqa: BLE001
                _say(f"speak threw on channel={channel}: {e!r}")
                ok = False
                status_code = "exc"
                body = str(e)
            if ok:
                state.last_spoken_text = text
                state.speak_count += 1
                _say(f"channel={channel} spoke #{state.speak_count} status={status_code}: {text[:80]}")
            else:
                _say(f"channel={channel} /speak FAILED status={status_code} body={body!r} text={text[:80]!r}")
            duration = news_feed.estimate_duration_s(text)
            state.stop_event.wait(timeout=duration)
            if state.stop_event.is_set():
                break
            state.stop_event.wait(timeout=INTER_ITEM_GAP_S)
    _say(f"reader exited for channel={channel} (spoke {state.speak_count} items)")


def _shutdown_channel(channel: str, hangup_fn: Callable) -> None:
    """Stop reader + hang up the ConvoAI agent for a channel."""
    with _lock:
        state = _channels.pop(channel, None)
    if state is None:
        return
    state.stop_event.set()
    if state.agent_id:
        try:
            hangup_fn(state.agent_id, state.constants)
            log.info("[news] hangup OK channel=%s agent=%s", channel, state.agent_id)
        except Exception as e:  # noqa: BLE001
            log.warning("[news] hangup failed channel=%s: %s", channel, e)
    news_feed.forget_channel(channel)


def join(
    channel: str,
    profile: str,
    constants: dict,
    start_agent_fn: Callable[[str, str, dict], str | None],
    speak_fn: Callable,
    hangup_fn: Callable,
) -> tuple[ChannelState, str, bool]:
    """Register a new viewer on `channel`. Returns (state, session_id, was_first).

    On the 0→1 transition: starts the agent + reader thread.
    Subsequent joiners just register and reuse the same agent.
    """
    _ensure_sweeper(speak_fn, hangup_fn)
    session_id = str(uuid4())
    with _lock:
        state = _channels.get(channel)
        was_first = state is None
        if was_first:
            state = ChannelState(channel=channel, profile=profile, constants=constants)
            _channels[channel] = state
            try:
                agent_id = start_agent_fn(channel, profile, constants)
            except Exception as e:  # noqa: BLE001
                _channels.pop(channel, None)
                raise RuntimeError(f"failed to start agent: {e}") from e
            if not agent_id:
                _channels.pop(channel, None)
                raise RuntimeError("agent start returned no agent_id")
            state.agent_id = agent_id
            state.reader = threading.Thread(
                target=_reader_loop,
                args=(channel, speak_fn),
                name=f"news-reader-{channel}",
                daemon=True,
            )
            state.reader.start()
        state.sessions[session_id] = time.time()
    return state, session_id, was_first


def heartbeat(channel: str, session_id: str) -> bool:
    with _lock:
        state = _channels.get(channel)
        if not state or session_id not in state.sessions:
            return False
        state.sessions[session_id] = time.time()
        return True


def leave(channel: str, session_id: str, hangup_fn: Callable) -> bool:
    with _lock:
        state = _channels.get(channel)
        if not state:
            return False
        state.sessions.pop(session_id, None)
        empty = not state.sessions
    if empty:
        _shutdown_channel(channel, hangup_fn)
    return True


def snapshot() -> dict:
    """Operator-friendly status dump."""
    with _lock:
        return {
            "channels": [
                {
                    "channel": s.channel,
                    "profile": s.profile,
                    "agent_id": s.agent_id,
                    "sessions": len(s.sessions),
                    "spoke": s.speak_count,
                    "uptime_s": int(time.time() - s.started_at),
                    "last_text": s.last_spoken_text,
                }
                for s in _channels.values()
            ],
        }
