import { AlertTriangle, LockKeyhole, UserPlus, Users } from 'lucide-react';
import { ConsoleButton, ConsoleCard, ConsoleShell } from './ConsoleShell';

export function EmptyCandidatePipelineScreen() {
  return <ConsoleShell title="Candidate Pipeline" subtitle="Review and manage candidates across every active role." actions={<ConsoleButton><UserPlus size={16}/> Invite Candidates</ConsoleButton>}><ConsoleCard className="grid min-h-[500px] place-items-center p-10 text-center"><div><span className="mx-auto grid size-20 place-items-center rounded-full bg-[#f0f2f4]"><Users size={34} strokeWidth={1.4}/></span><h2 className="mt-6 font-serif text-2xl font-bold">No candidates found</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#676c74]">Invite candidates to an active interview or import a CSV to begin tracking your pipeline.</p><div className="mt-6 flex justify-center gap-3"><ConsoleButton><UserPlus size={15}/> Invite candidates</ConsoleButton><ConsoleButton variant="outline">Import CSV</ConsoleButton></div></div></ConsoleCard></ConsoleShell>;
}

export function CandidateActivityScreen({candidateSlug}:{candidateSlug:string}) {
  return <ConsoleShell eyebrow="Candidates / Activity" title="Candidate Activity" subtitle="Candidate activity will appear after invitations and interview lifecycle events are persisted." actions={<ConsoleButton href={`/enterprise/candidates/${candidateSlug}/report`}>View Evaluation Report</ConsoleButton>}><ConsoleCard className="grid min-h-[360px] place-items-center p-10 text-center"><div><h2 className="font-serif text-2xl font-bold">No stored activity yet</h2><p className="mt-2 text-sm text-[#676c74]">This page no longer displays fixture events.</p></div></ConsoleCard></ConsoleShell>;
}

export function EnterpriseAccessDeniedScreen() {
  return <ConsoleShell><div className="grid min-h-[70vh] place-items-center text-center"><div><span className="mx-auto grid size-20 place-items-center rounded-full bg-[#f0f2f4]"><LockKeyhole size={34}/></span><h1 className="mt-6 font-serif text-3xl font-bold">Access restricted</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#676c74]">Your RecruitPro role does not include permission to view this workspace. Ask an organization administrator for access.</p><ConsoleButton href="/enterprise">Return to dashboard</ConsoleButton></div></div></ConsoleShell>;
}

export function EnterpriseErrorScreen() {
  return <ConsoleShell><div className="grid min-h-[70vh] place-items-center text-center"><div><span className="mx-auto grid size-20 place-items-center rounded-full bg-[#fbeceb] text-[#a64239]"><AlertTriangle size={34}/></span><h1 className="mt-6 font-serif text-3xl font-bold">We couldn&apos;t load this page</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#676c74]">RecruitPro could not retrieve this enterprise data. Your work is safe—try the request again.</p><div className="mt-6 flex justify-center gap-3"><ConsoleButton>Try again</ConsoleButton><ConsoleButton href="/enterprise" variant="outline">Dashboard</ConsoleButton></div></div></div></ConsoleShell>;
}

export function EnterpriseLoadingScreen() {
  return <ConsoleShell><div className="animate-pulse"><div className="h-10 w-72 rounded bg-[#e5e8eb]"/><div className="mt-3 h-4 w-96 rounded bg-[#eceef0]"/><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map(item=><div key={item} className="h-32 rounded-xl border border-[#e1e4e7] bg-white p-5"/>)}</div><div className="mt-5 h-96 rounded-xl border border-[#e1e4e7] bg-white"/></div></ConsoleShell>;
}
