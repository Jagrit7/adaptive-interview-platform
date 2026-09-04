'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, Search, Sparkles } from 'lucide-react';
import { AuthGate } from '@/components/ui/AuthGate';
import { listReports, loadReportRecord, type RankedReport, type ReportRecord, type ReportSummary } from '@/lib/reports';
import { InterviewReportView, initials, percent } from '@/components/reports/InterviewReportView';
import { ConsoleButton, ConsoleCard, ConsoleShell, StatusPill } from './ConsoleShell';

const AgoraReportQueryWorkspace = dynamic(
  () => import('./AgoraReportQueryWorkspace').then(module => module.AgoraReportQueryWorkspace),
  { ssr: false, loading: () => <ConsoleCard className="animate-pulse p-8 text-sm text-[#737880]">Loading Agora voice analyst…</ConsoleCard> },
);

const slug=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

export function EnterpriseReportsClient({queryMode=false}:{queryMode?:boolean}) {
  return <AuthGate role="enterprise"><ReportsInner queryMode={queryMode}/></AuthGate>;
}

function ReportsInner({queryMode}:{queryMode:boolean}) {
  const [rows,setRows]=useState<ReportSummary[]>([]); const [search,setSearch]=useState(''); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  useEffect(()=>{let active=true;listReports().then(data=>{if(active)setRows(data)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:String(reason))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false};},[]);
  if(queryMode)return <AgoraReportQueryWorkspace/>;
  const visibleRows=rows.filter(row=>`${row.candidate_name} ${row.candidate_ref} ${row.role_name} ${row.panel_name}`.toLowerCase().includes(search.toLowerCase()));
  return <ConsoleShell title="Candidate Reports" subtitle="Completed interview evaluations generated from real candidate sessions." actions={<ConsoleButton href="/enterprise/reports/query"><Sparkles size={16}/> Ask Reports</ConsoleButton>}>
    <ReportTabs active="reports"/>
    {error&&<ErrorCard text={error}/>} {loading&&<LoadingCard/>}
    {!loading&&!error&&rows.length===0&&<ConsoleCard className="grid min-h-[390px] place-items-center p-10 text-center"><div><h2 className="font-serif text-2xl font-bold">No candidate reports yet</h2><p className="mt-2 text-sm text-[#6d727a]">Reports appear here after a published interview finishes successfully.</p></div></ConsoleCard>}
    {!loading&&!error&&rows.length>0&&<ConsoleCard className="overflow-hidden"><div className="flex gap-3 p-5"><div className="relative flex-1"><Search size={15} className="absolute left-3 top-3"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search candidates or roles" className="h-10 w-full rounded-lg border border-[#dfe2e6] pl-9 text-sm"/></div></div>{visibleRows.length?<ReportTable rows={visibleRows}/>:<p className="border-t border-[#e5e7ea] p-8 text-sm text-[#6d727a]">No reports match that search.</p>}</ConsoleCard>}
  </ConsoleShell>;
}

function ReportTabs({active}:{active:'reports'|'query'}) { return <div className="mb-5 flex gap-6 border-b border-[#dfe2e6]"><Link href="/enterprise/reports" className={`pb-3 text-sm font-semibold ${active==='reports'?'border-b-2 border-black':'text-[#777c84]'}`}>All Reports</Link><Link href="/enterprise/reports/query" className={`pb-3 text-sm font-semibold ${active==='query'?'border-b-2 border-black':'text-[#777c84]'}`}>Ask Reports</Link></div>; }

function ReportTable({rows,ranked=false}:{rows:(ReportSummary|RankedReport)[];ranked?:boolean}) { return <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="border-y border-[#e5e7ea] bg-[#fafbfc] text-left text-xs uppercase tracking-wider text-[#777c84]"><tr><th className="px-6 py-3">Candidate</th><th className="px-6 py-3">Role</th><th className="px-6 py-3">Recommendation</th><th className="px-6 py-3">{ranked?'Matched score':'Overall score'}</th><th className="px-6 py-3">Completed</th><th/></tr></thead><tbody>{rows.map(row=>{const rankedRow=row as RankedReport;return <tr key={row.id} className="border-b border-[#e8eaed]"><td className="px-6 py-4"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#dce9ff] text-xs font-bold">{initials(row.candidate_name)}</span><div><b>{row.candidate_name||'Unnamed candidate'}</b><p className="text-xs text-[#858a92]">{row.candidate_ref}</p></div></div></td><td className="px-6 py-4">{row.role_name||row.panel_name}</td><td className="px-6 py-4"><StatusPill tone={row.band==='Strong'?'green':row.band==='Solid'?'blue':'amber'}>{row.recommendation||row.band||'Pending'}</StatusPill></td><td className="px-6 py-4"><b>{percent(ranked?rankedRow.matched_score:row.overall_score)}</b>{ranked&&<span className="ml-2 text-xs text-[#777c84]">{rankedRow.matched_metric}</span>}</td><td className="px-6 py-4 text-[#686d75]">{new Date(row.finished_at??row.created_at).toLocaleDateString()}</td><td className="px-6 py-4"><Link href={`/enterprise/reports/${row.id}`} className="inline-flex items-center gap-1 font-semibold hover:underline">Open <ArrowRight size={14}/></Link></td></tr>})}</tbody></table></div>; }

export function EnterpriseReportDetailClient({reportId,candidateSlug}:{reportId?:string;candidateSlug?:string}) { return <AuthGate role="enterprise"><ReportDetailLoader reportId={reportId} candidateSlug={candidateSlug}/></AuthGate>; }
function ReportDetailLoader({reportId,candidateSlug}:{reportId?:string;candidateSlug?:string}) { const [record,setRecord]=useState<ReportRecord|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');useEffect(()=>{let active=true;(async()=>{try{let id=reportId;if(!id&&candidateSlug){const rows=await listReports();id=rows.find(row=>slug(row.candidate_name)===candidateSlug)?.id}if(!id)throw new Error('No stored report was found for this candidate.');const data=await loadReportRecord(id);if(active)setRecord(data)}catch(reason){if(active)setError(reason instanceof Error?reason.message:String(reason))}finally{if(active)setLoading(false)}})();return()=>{active=false};},[reportId,candidateSlug]);if(loading)return <ConsoleShell title="Candidate Evaluation"><LoadingCard/></ConsoleShell>;if(error||!record)return <ConsoleShell title="Report unavailable" subtitle={error}><ConsoleButton href="/enterprise/reports">Back to reports</ConsoleButton></ConsoleShell>;return <ReportDetail record={record}/>; }

// The report body itself lives in components/reports/InterviewReportView so the
// stored enterprise report, the candidate's published result, and the throwaway
// test report cannot drift apart visually. This is only the console chrome.
function ReportDetail({record}:{record:ReportRecord}) { return <ConsoleShell eyebrow="Candidates / Evaluation Report" actions={<><ConsoleButton href="/enterprise/reports" variant="outline">All Reports</ConsoleButton><ConsoleButton href="/enterprise/reports/query">Compare with Ask Reports</ConsoleButton></>}><InterviewReportView record={record}/></ConsoleShell>; }
function LoadingCard(){return <ConsoleCard className="animate-pulse p-8 text-sm text-[#737880]">Loading reports…</ConsoleCard>}
function ErrorCard({text}:{text:string}){return <ConsoleCard className="border-red-200 bg-red-50 p-5 text-sm text-red-800">{text}</ConsoleCard>}
