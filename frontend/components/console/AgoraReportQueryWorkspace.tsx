'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Mic, MicOff, Sparkles, Volume2 } from 'lucide-react';
import { useAgoraVoiceClient } from '@/hooks/useAgoraVoiceClient';
import {
  queryCandidateReports,
  type RankedReport,
  type ReportQuery,
} from '@/lib/reports';
import { ConsoleButton, ConsoleCard, ConsoleShell, StatusPill } from './ConsoleShell';

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID ?? '02bcecea17334c6dad96219c276fbd38';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const REPORT_AGENT_UID = '21';
const QUERY_SETTLE_MS = 1400;

const percent = (value: number | null) => value === null ? '—' : String(Math.round(value * 100));
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'CA';

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (data as { detail?: string }).detail;
    throw new Error(detail || `Request failed (${response.status}).`);
  }
  return data as T;
}

function QueryTabs() {
  return <div className="mb-5 flex gap-6 border-b border-[#dfe2e6]">
    <Link href="/enterprise/reports" className="pb-3 text-sm font-semibold text-[#777c84]">All Reports</Link>
    <Link href="/enterprise/reports/query" className="border-b-2 border-black pb-3 text-sm font-semibold">Ask Reports</Link>
  </div>;
}

function ResultsTable({ rows }: { rows: RankedReport[] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
    <thead className="border-y border-[#e5e7ea] bg-[#fafbfc] text-left text-xs uppercase tracking-wider text-[#777c84]"><tr><th className="px-6 py-3">Rank</th><th className="px-6 py-3">Candidate</th><th className="px-6 py-3">Role</th><th className="px-6 py-3">Recommendation</th><th className="px-6 py-3">Matched score</th><th /></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={row.id} className="border-b border-[#e8eaed]"><td className="px-6 py-4 font-serif text-xl font-bold">{index + 1}</td><td className="px-6 py-4"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#dce9ff] text-xs font-bold">{initials(row.candidate_name)}</span><div><b>{row.candidate_name || 'Unnamed candidate'}</b><p className="text-xs text-[#858a92]">{row.candidate_ref}</p></div></div></td><td className="px-6 py-4">{row.role_name || row.panel_name}</td><td className="px-6 py-4"><StatusPill tone={row.band === 'Strong' ? 'green' : row.band === 'Solid' ? 'blue' : 'amber'}>{row.recommendation || row.band || 'Pending'}</StatusPill></td><td className="px-6 py-4"><b>{percent(row.matched_score)}</b><span className="ml-2 text-xs text-[#777c84]">{row.matched_metric}</span></td><td className="px-6 py-4"><Link href={`/enterprise/reports/${row.id}`} className="font-semibold hover:underline">Open</Link></td></tr>)}</tbody>
  </table></div>;
}

export function AgoraReportQueryWorkspace() {
  const [channel] = useState(() => `reports-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [uid] = useState(() => Math.floor(Math.random() * 1_000_000) + 100_000);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [results, setResults] = useState<RankedReport[]>([]);
  const [interpreted, setInterpreted] = useState<ReportQuery | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Voice analyst is ready to connect.');
  const sessionIdRef = useRef<string | null>(null);
  const processedRef = useRef<Set<string>>(new Set());
  const pendingSpeechRef = useRef<string[]>([]);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryInFlightRef = useRef(false);

  const {
    isConnected,
    isMuted,
    isAgentSpeaking,
    isAgentListening,
    inputVolume,
    voiceError,
    messageList,
    joinChannel,
    leaveChannel,
    toggleMute,
  } = useAgoraVoiceClient();

  const runQuery = useCallback(async (value: string, voiceSessionId?: string | null) => {
    const text = value.trim();
    if (!text || queryInFlightRef.current) return;
    queryInFlightRef.current = true;
    setError('');
    setLoading(true);
    setPrompt(text);
    setStatus('Checking verified candidate reports…');
    try {
      const path = voiceSessionId
        ? `/report-query/sessions/${voiceSessionId}/interpret`
        : '/report-query/interpret';
      const parsed = await apiJson<ReportQuery>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const ranked = await queryCandidateReports(parsed);
      setInterpreted(parsed);
      setResults(ranked);

      if (voiceSessionId) {
        await apiJson(`/report-query/sessions/${voiceSessionId}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: parsed,
            candidates: ranked.map(row => ({
              candidate_name: row.candidate_name,
              role_name: row.role_name || row.panel_name,
              score: row.matched_score,
              metric: row.matched_metric,
            })),
          }),
        });
        setStatus('Rhea is presenting the verified results.');
      } else {
        setStatus('Results ready. Start voice analyst to continue by voice.');
      }
    } catch (reason) {
      setResults([]);
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus('The query could not be completed.');
    } finally {
      setLoading(false);
      queryInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let added = false;
    for (const message of messageList) {
      const key = `${message.uid}:${message.turn_id}`;
      if (processedRef.current.has(key)) continue;
      processedRef.current.add(key);
      // Agora may normalize the candidate transcript UID differently from the
      // numeric RTC UID. The agent UID is pinned, so "not the agent" is the
      // stable distinction used by the interview room as well.
      if (String(message.uid) === REPORT_AGENT_UID || !message.text.trim()) continue;
      pendingSpeechRef.current.push(message.text.trim());
      added = true;
    }
    if (!added) return;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      const spoken = pendingSpeechRef.current.join(' ').replace(/\s+/g, ' ').trim();
      pendingSpeechRef.current = [];
      if (spoken) void runQuery(spoken, sessionId);
    }, QUERY_SETTLE_MS);
  }, [messageList, runQuery, sessionId, uid]);

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    const activeSession = sessionIdRef.current;
    if (activeSession) {
      void fetch(`${BACKEND_URL}/report-query/sessions/${activeSession}/end`, { method: 'POST', keepalive: true });
    }
    void leaveChannel();
  }, [leaveChannel]);

  async function startVoice() {
    if (starting || isConnected) return;
    setStarting(true);
    setError('');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access requires localhost or HTTPS.');
      }
      setStatus('Joining the secure Agora channel…');
      const tokenData = await apiJson<{ token: string }>(`/token?channel=${encodeURIComponent(channel)}&uid=${uid}`);
      await joinChannel({
        appId: APP_ID,
        channel,
        token: tokenData.token,
        uid,
        agentUid: REPORT_AGENT_UID,
      });
      setStatus('Starting Rhea…');
      const started = await apiJson<{ session_id: string; agent_uid: string }>('/report-query/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, remote_uid: String(uid), language: 'en-US' }),
      });
      sessionIdRef.current = started.session_id;
      setSessionId(started.session_id);
      setStatus('Connected. Ask for a ranking when Rhea finishes greeting.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus('Voice analyst could not connect.');
      await leaveChannel();
    } finally {
      setStarting(false);
    }
  }

  async function stopVoice() {
    const activeSession = sessionIdRef.current;
    sessionIdRef.current = null;
    setSessionId(null);
    if (activeSession) {
      await fetch(`${BACKEND_URL}/report-query/sessions/${activeSession}/end`, { method: 'POST' }).catch(() => undefined);
    }
    await leaveChannel();
    setStatus('Voice analyst disconnected.');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void runQuery(prompt, sessionId);
  }

  const voiceState = isAgentSpeaking
    ? 'Rhea is speaking'
    : isAgentListening
      ? 'Rhea is listening'
      : isConnected
        ? 'Connected'
        : 'Disconnected';

  return <ConsoleShell title="Ask Reports" subtitle="Speak naturally with an Agora Conversational AI analyst backed by your verified candidate reports." actions={<ConsoleButton href="/enterprise/reports">All Reports</ConsoleButton>}>
    <QueryTabs />
    <ConsoleCard className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[300px_1fr]">
        <div className="bg-[#111214] p-7 text-white">
          <div className="flex items-center justify-between"><span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">Agora Conversational AI</span>{isConnected && <span className="size-2 rounded-full bg-emerald-400" />}</div>
          <div className="mt-10 grid place-items-center"><div className={`grid size-28 place-items-center rounded-full border border-white/15 bg-white/10 transition ${isAgentSpeaking ? 'scale-105 shadow-[0_0_0_12px_rgba(255,255,255,.06)]' : ''}`}><Volume2 size={34} /></div><h2 className="mt-5 font-serif text-2xl font-bold">Rhea</h2><p className="mt-1 text-sm text-white/60">Report analyst</p></div>
          <div className="mt-8 rounded-lg bg-white/5 p-4"><p className="text-sm font-semibold">{voiceState}</p><p className="mt-1 text-xs leading-5 text-white/55">{voiceError || status}</p>{isConnected && <div className="mt-3 h-1 overflow-hidden rounded bg-white/10"><div className="h-full rounded bg-white transition-all" style={{ width: `${Math.max(4, Math.min(100, inputVolume * 400))}%` }} /></div>}</div>
          <div className="mt-5 flex gap-2">{!isConnected ? <button onClick={() => void startVoice()} disabled={starting} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-white text-sm font-bold text-black disabled:opacity-60"><Mic size={17} />{starting ? 'Connecting…' : 'Start voice analyst'}</button> : <><button onClick={() => void toggleMute()} className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-bold ${isMuted ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>{isMuted ? <MicOff size={17} /> : <Mic size={17} />}{isMuted ? 'Unmute' : 'Mute'}</button><button onClick={() => void stopVoice()} className="h-11 rounded-lg border border-white/20 px-3 text-xs font-semibold">End</button></>}</div>
        </div>
        <div className="p-7">
          <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#6e737b]">Try asking</p>
          <div className="mt-3 flex flex-wrap gap-2">{['Top 5 candidates overall', 'Top 5 candidates based on system design', 'Top 2 candidates based on communication'].map(example => <button key={example} onClick={() => { setPrompt(example); void runQuery(example, sessionId); }} className="rounded-full border border-[#d9dde2] bg-[#fafbfc] px-3 py-1.5 text-xs hover:border-black">{example}</button>)}</div>
          <form onSubmit={submit} className="mt-7 flex gap-3"><div className="relative flex-1"><Sparkles size={18} className="absolute left-4 top-4" /><input value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Ask for top candidates by score, role, or competency…" className="h-12 w-full rounded-lg border border-[#cfd4da] pl-11 pr-4 text-sm outline-none focus:border-black" /></div><ConsoleButton type="submit">Run query</ConsoleButton></form>
          {interpreted && <p className="mt-4 text-xs text-[#747981]">Interpreted as: top {interpreted.limit} by {interpreted.metric === 'overall' ? 'overall score' : interpreted.competency}{interpreted.role ? ` for ${interpreted.role}` : ''}.</p>}
          <div className="mt-7 rounded-lg border border-[#e4e6e9] bg-[#fafbfc] p-4 text-sm text-[#636871]"><b className="text-black">Voice flow:</b> speak after Rhea greets you. She acknowledges the request, the app runs a read-only Supabase query, and she speaks only the verified ranking returned.</div>
        </div>
      </div>
    </ConsoleCard>
    {(error || voiceError) && <ConsoleCard className="mt-5 border-red-200 bg-red-50 p-5 text-sm text-red-800">{error || voiceError}</ConsoleCard>}
    {loading && <ConsoleCard className="mt-5 animate-pulse p-8 text-sm text-[#737880]">Checking verified reports…</ConsoleCard>}
    {!loading && interpreted && !error && <ConsoleCard className="mt-5 overflow-hidden"><div className="p-6"><h2 className="font-serif text-xl font-bold">Results</h2><p className="mt-1 text-sm text-[#747981]">{results.length} matching candidate{results.length === 1 ? '' : 's'}</p></div>{results.length ? <ResultsTable rows={results} /> : <p className="border-t border-[#e5e7ea] p-8 text-sm text-[#6d727a]">No stored reports match that query.</p>}</ConsoleCard>}
  </ConsoleShell>;
}
