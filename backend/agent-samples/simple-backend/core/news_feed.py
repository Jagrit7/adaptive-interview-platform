"""News feed aggregator — pulls trending world-news + tech headlines from
free, no-auth sources for the /news demo's avatar to read aloud.

Sources:
  * BBC News — World, top stories RSS
  * Hacker News — top stories via Algolia search API
  * The Verge — top stories RSS

The reader thread asks for `next_unspoken_items(channel, n)` which
returns the freshest items it hasn't yet spoken for that channel,
interleaved across sources so the demo doesn't read five Hacker News
posts in a row.
"""

from __future__ import annotations

import html
import logging
import re
import threading
import time
import urllib.request
import urllib.error
from xml.etree import ElementTree as ET

log = logging.getLogger(__name__)

# How long a fetched feed is considered fresh before re-pulling.
CACHE_TTL_S = 120
# How many items per source we ever consider.
MAX_PER_SOURCE = 20
# After speaking everything once, how long before we are allowed to
# re-read the same item (a hedge against quiet feed days).
REREAD_AFTER_S = 5 * 60

_USER_AGENT = "convoai-news-reader/1.0 (+https://convoai-demo.agora.io/news)"

# In-memory cache: source key → (fetched_at, [item, ...])
_cache: dict[str, tuple[float, list[dict]]] = {}
_cache_lock = threading.Lock()

# Per-channel set of item IDs already spoken (with last_spoken ts).
# Lets concurrent channels each have their own playback position
# without re-reading themselves until REREAD_AFTER_S has passed.
_spoken: dict[str, dict[str, float]] = {}
_spoken_lock = threading.Lock()

# Curated X handles that act as our "trending posts and commentary"
# feed. Mix of wire-style news, tech outlets, and AI / tech voices.
# Posts go through the same dedup + interleave as everything else.
X_HANDLES = (
    ("BBCBreaking", "BBC Breaking News"),
    ("Reuters", "Reuters"),
    ("TheVerge", "The Verge"),
    ("sama", "Sam Altman"),
    ("karpathy", "Andrej Karpathy"),
)
# X bearer is loaded lazily so this module stays importable without env.
_x_cache_ttl_s = 5 * 60
# Minimum engagement (likes) for an X post to count as "trending".
# Lower bar for accounts that always post quietly (commentary voices).
_X_LIKE_FLOOR_NEWS = 50
_X_LIKE_FLOOR_VOICE = 100
_X_VOICE_HANDLES = {"sama", "karpathy"}


def _http_get(url: str, timeout: float = 8.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — trusted feed URLs
        return resp.read()


def _clean(text: str | None) -> str:
    if not text:
        return ""
    # Strip CDATA wrappers / HTML tags / collapse whitespace.
    text = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _parse_rss(xml_bytes: bytes, source: str) -> list[dict]:
    items: list[dict] = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        log.warning("rss parse failed for %s: %s", source, e)
        return items
    for item in root.iter("item"):
        title = _clean((item.findtext("title") or "").strip())
        desc = _clean((item.findtext("description") or "").strip())
        link = (item.findtext("link") or "").strip()
        guid = (item.findtext("guid") or link or title).strip()
        if not title:
            continue
        items.append({
            "id": f"{source}:{guid}",
            "source": source,
            "title": title,
            "summary": desc,
            "url": link,
        })
        if len(items) >= MAX_PER_SOURCE:
            break
    return items


def _fetch_bbc_world() -> list[dict]:
    try:
        body = _http_get("https://feeds.bbci.co.uk/news/world/rss.xml")
    except urllib.error.URLError as e:
        log.warning("bbc fetch failed: %s", e)
        return []
    return _parse_rss(body, "bbc")


def _fetch_guardian() -> list[dict]:
    try:
        body = _http_get("https://www.theguardian.com/world/rss")
    except urllib.error.URLError as e:
        log.warning("guardian fetch failed: %s", e)
        return []
    return _parse_rss(body, "guardian")


def _fetch_npr() -> list[dict]:
    try:
        body = _http_get("https://feeds.npr.org/1001/rss.xml")
    except urllib.error.URLError as e:
        log.warning("npr fetch failed: %s", e)
        return []
    return _parse_rss(body, "npr")


def _fetch_aljazeera() -> list[dict]:
    try:
        body = _http_get("https://www.aljazeera.com/xml/rss/all.xml")
    except urllib.error.URLError as e:
        log.warning("aljazeera fetch failed: %s", e)
        return []
    return _parse_rss(body, "aljazeera")


def _fetch_techcrunch() -> list[dict]:
    try:
        body = _http_get("https://techcrunch.com/feed/")
    except urllib.error.URLError as e:
        log.warning("techcrunch fetch failed: %s", e)
        return []
    return _parse_rss(body, "techcrunch")


def _fetch_arstechnica() -> list[dict]:
    try:
        body = _http_get("https://feeds.arstechnica.com/arstechnica/index")
    except urllib.error.URLError as e:
        log.warning("ars fetch failed: %s", e)
        return []
    return _parse_rss(body, "ars")


def _fetch_verge() -> list[dict]:
    try:
        body = _http_get("https://www.theverge.com/rss/index.xml")
    except urllib.error.URLError as e:
        log.warning("verge fetch failed: %s", e)
        return []
    # The Verge ships Atom; ET parses both with a slight tag tweak.
    items: list[dict] = []
    try:
        root = ET.fromstring(body)
    except ET.ParseError as e:
        log.warning("verge parse failed: %s", e)
        return items
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for entry in root.findall("atom:entry", ns)[:MAX_PER_SOURCE]:
        title = _clean(entry.findtext("atom:title", default="", namespaces=ns))
        link_el = entry.find("atom:link", ns)
        url = (link_el.get("href") if link_el is not None else "") or ""
        guid = entry.findtext("atom:id", default=url, namespaces=ns)
        summary = _clean(entry.findtext("atom:summary", default="", namespaces=ns))
        if not title:
            continue
        items.append({
            "id": f"verge:{guid}",
            "source": "verge",
            "title": title,
            "summary": summary,
            "url": url,
        })
    return items


def _fetch_hn() -> list[dict]:
    """Algolia HN front-page search — sorted by date, dedup by objectID."""
    try:
        import json
        body = _http_get(
            "https://hn.algolia.com/api/v1/search_by_date"
            "?tags=front_page&hitsPerPage=20"
        )
        data = json.loads(body)
    except (urllib.error.URLError, ValueError) as e:
        log.warning("hn fetch failed: %s", e)
        return []
    items: list[dict] = []
    for hit in data.get("hits", [])[:MAX_PER_SOURCE]:
        title = _clean(hit.get("title") or hit.get("story_title") or "")
        if not title:
            continue
        # Self-posts have story_text; link-posts don't. Either way we
        # can show points + comment count as the engagement signal.
        story_text = _clean(hit.get("story_text") or "")
        items.append({
            "id": f"hn:{hit.get('objectID')}",
            "source": "hn",
            "title": title,
            "summary": story_text,
            "url": hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
            "points": hit.get("points") or 0,
            "num_comments": hit.get("num_comments") or 0,
        })
    return items


# --- X trending posts / commentary ---

def _fetch_x_handles() -> list[dict]:
    """Pull the latest non-retweet, non-reply posts from a curated set
    of news + tech / AI voices on X. Filtered by a minimum like floor
    so we surface only items that actually got traction."""
    import os
    try:
        # Lazy import so news_feed stays importable in tests.
        from x.profile_prompt import (
            XApiError,
            http_get_json,
            lookup_user,
            clean_text,
            is_retweet,
            is_reply,
        )
    except Exception as e:  # noqa: BLE001
        log.warning("X helpers unavailable: %s", e)
        return []

    token = os.environ.get("X_API_BEARER_TOKEN")
    if not token:
        return []

    items: list[dict] = []
    for handle, display_name in X_HANDLES:
        try:
            user = lookup_user(token, handle, timeout_seconds=6.0)
            user_id = user.get("data", {}).get("id")
            if not user_id:
                continue
            # fetch_user_timeline doesn't request public_metrics — without
            # it every tweet looks like 0 likes and our engagement floor
            # rejects everything. Call the API directly with the fields
            # we actually need.
            timeline = http_get_json(
                token,
                f"/users/{user_id}/tweets",
                {
                    "max_results": 10,
                    "exclude": "retweets",
                    "tweet.fields": "created_at,in_reply_to_user_id,referenced_tweets,text,public_metrics",
                },
                timeout_seconds=6.0,
            )
        except XApiError as e:
            log.info("x fetch failed for @%s: %s", handle, e)
            continue
        except Exception as e:  # noqa: BLE001 — never let one bad handle kill the loop
            log.warning("x fetch crashed for @%s: %s", handle, e)
            continue

        floor = _X_LIKE_FLOOR_VOICE if handle in _X_VOICE_HANDLES else _X_LIKE_FLOOR_NEWS
        for post in timeline.get("data") or []:
            if is_retweet(post) or is_reply(post):
                continue
            metrics = post.get("public_metrics") or {}
            likes = int(metrics.get("like_count", 0) or 0)
            if likes < floor:
                continue
            text = clean_text(post.get("text") or "")
            # Strip t.co shortlinks + dangling whitespace — TTS reads
            # raw URLs as "h-t-t-p-s colon slash slash…"
            text = re.sub(r"https?://t\.co/\S+", "", text)
            text = re.sub(r"\s+", " ", text).strip()
            if not text or len(text) < 40:
                continue
            items.append({
                "id": f"x:{post.get('id')}",
                "source": "x",
                "handle": handle,
                "display_name": display_name,
                "title": text,
                "summary": "",
                "url": f"https://x.com/{handle}/status/{post.get('id')}",
                "likes": likes,
                "retweets": int(metrics.get("retweet_count", 0) or 0),
            })
        # Be polite to the X API and limit our quota burn.
        if len(items) >= MAX_PER_SOURCE:
            break
    return items[:MAX_PER_SOURCE]


SOURCES = {
    "bbc": _fetch_bbc_world,
    "guardian": _fetch_guardian,
    "npr": _fetch_npr,
    "aljazeera": _fetch_aljazeera,
    "hn": _fetch_hn,
    "verge": _fetch_verge,
    "techcrunch": _fetch_techcrunch,
    "ars": _fetch_arstechnica,
    "x": _fetch_x_handles,
}

# Per-source cache TTL overrides. X has a tight quota, so we cache
# longer than the general 2-min news cadence.
SOURCE_TTL_OVERRIDES = {"x": _x_cache_ttl_s}


def _cached(source: str) -> list[dict]:
    now = time.time()
    ttl = SOURCE_TTL_OVERRIDES.get(source, CACHE_TTL_S)
    with _cache_lock:
        entry = _cache.get(source)
        if entry and (now - entry[0]) < ttl:
            return list(entry[1])
    items = SOURCES[source]()
    with _cache_lock:
        _cache[source] = (now, items)
    return items


def _interleave(per_source: dict[str, list[dict]]) -> list[dict]:
    """Round-robin across sources so the reader doesn't say "next on
    Hacker News..." five times in a row."""
    result: list[dict] = []
    indexes = {k: 0 for k in per_source}
    keys = list(per_source.keys())
    if not keys:
        return result
    while True:
        progressed = False
        for k in keys:
            i = indexes[k]
            if i < len(per_source[k]):
                result.append(per_source[k][i])
                indexes[k] = i + 1
                progressed = True
        if not progressed:
            break
    return result


def fetch_all() -> list[dict]:
    """Refresh-aware fetch across all sources, interleaved."""
    return _interleave({k: _cached(k) for k in SOURCES})


def _shorten_summary(text: str, max_words: int = 35) -> str:
    """Trim a description to roughly max_words on a sentence boundary
    so the TTS doesn't get cut mid-thought. Falls back to a word
    trim with an ellipsis if no sentence break is reachable."""
    text = text.strip()
    if not text:
        return ""
    words = text.split()
    if len(words) <= max_words:
        return text
    trimmed = " ".join(words[:max_words])
    # Prefer to end at the last sentence break inside the trim window.
    for stop in (". ", "! ", "? "):
        idx = trimmed.rfind(stop)
        if idx > 40:  # ignore breaks too close to the start
            return trimmed[: idx + 1].strip()
    return trimmed.rstrip(",.;:") + "…"


SOURCE_LABELS = {
    "bbc": "BBC",
    "guardian": "The Guardian",
    "npr": "NPR",
    "aljazeera": "Al Jazeera",
    "hn": "Hacker News",
    "verge": "The Verge",
    "techcrunch": "TechCrunch",
    "ars": "Ars Technica",
}


def speak_text_for(item: dict) -> str:
    """Build the spoken line. Mixes news headlines + descriptions with
    X commentary so the demo feels like a live news channel with
    trending posts and reactions. Capped around 60 spoken words so a
    single item stays under ~25 s of TTS."""
    title = (item.get("title") or "").rstrip(" .!?")
    parts: list[str] = []
    src = item["source"]

    if src == "x":
        # Trending post / commentary. Mention the handle so it sounds
        # like a real "and on X..." segment.
        handle = item.get("handle") or ""
        display = item.get("display_name") or f"@{handle}"
        likes = item.get("likes") or 0
        if likes >= 5000:
            lead = f"Trending on X, {display} posted: "
        else:
            lead = f"On X, {display} writes: "
        text = title.rstrip(".") + "."
        parts.append(lead + text)
    elif src == "hn":
        points = item.get("points") or 0
        comments = item.get("num_comments") or 0
        if points >= 100 or comments >= 30:
            parts.append(
                f"Trending on Hacker News with {points} points and {comments} comments: {title}."
            )
        else:
            parts.append(f"On Hacker News: {title}.")
        summary = _shorten_summary(item.get("summary") or "", max_words=30)
        if summary:
            parts.append(summary)
    else:
        label = SOURCE_LABELS.get(src, "")
        prefix = f"From {label}: " if label else ""
        parts.append(f"{prefix}{title}.")
        summary = _shorten_summary(item.get("summary") or "", max_words=35)
        if summary and summary.lower() not in title.lower() and title.lower() not in summary.lower():
            parts.append(summary)

    text = " ".join(parts)
    words = text.split()
    if len(words) > 60:
        text = " ".join(words[:60]).rstrip(",.;:") + "…"
    return text


def next_unspoken_items(channel: str, n: int = 5) -> list[dict]:
    """Return up to n items for this channel that haven't been spoken
    recently (within REREAD_AFTER_S). Updates spoken state so callers
    just iterate and speak."""
    now = time.time()
    with _spoken_lock:
        bucket = _spoken.setdefault(channel, {})
        # Garbage-collect old marks so the dict doesn't grow unbounded.
        cutoff = now - REREAD_AFTER_S
        stale = [k for k, ts in bucket.items() if ts < cutoff]
        for k in stale:
            bucket.pop(k, None)
    fresh = []
    for item in fetch_all():
        with _spoken_lock:
            if item["id"] in _spoken.get(channel, {}):
                continue
            _spoken[channel][item["id"]] = now
        fresh.append(item)
        if len(fresh) >= n:
            break
    return fresh


def forget_channel(channel: str) -> None:
    """Wipe spoken state when a channel shuts down."""
    with _spoken_lock:
        _spoken.pop(channel, None)


def estimate_duration_s(text: str) -> float:
    """Estimate seconds for a TTS line. ~2.5 words/sec + a 1.5 s
    pre-roll for TTS startup + a small per-line tail."""
    words = max(1, len(text.split()))
    return 1.5 + (words / 2.5) + 0.5
