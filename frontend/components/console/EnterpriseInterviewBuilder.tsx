'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Plus, Save, Trash2, UserRound } from 'lucide-react';
import { AuthGate } from '@/components/ui/AuthGate';
import { bankIdToUuid, bankItemsToKnowledge, isUserBankId, listBankItems, listUserBanks, userBankId, type UserBank } from '@/lib/questionBanks';
import { ConsoleButton, ConsoleCard, ConsoleShell } from './ConsoleShell';
import { savePanel } from '@/lib/panels';
import { enterpriseDraftToPanelConfig, type EnterpriseDraftStore, type EnterpriseInterviewer, useEnterpriseInterviewStore as useEnterpriseStore } from '@/store/enterpriseInterviewStore';
import type { RoleType } from '@/store/builderStore';

const STEPS = [
  ['basics','Basics'],['questions','Questions'],['ai','AI & Scoring'],['candidate-settings','Candidate Settings'],['review','Review & Publish'],
] as const;

const TITLES: Record<string,[string,string]> = {
  basics:['Basic Information','Define the role and purpose of this custom interview.'],
  questions:['Question Library','Select, edit, and add the questions this panel can ask.'],
  ai:['AI Interviewer & Scoring Configuration','Define each interviewer, what they score, and their share of the final result.'],
  'candidate-settings':['Candidate Settings','Configure candidate access, verification, and instructions.'],
  review:['Review & Publish','Review the complete interview before making it available to candidates.'],
};

const useEnterpriseInterviewStore = useEnterpriseStore as () => EnterpriseDraftStore;

function Input({ label, value, onChange, type='text' }: { label:string; value:string|number; onChange:(value:string)=>void; type?:string }) { return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} className="h-11 w-full rounded-lg border border-[#dfe2e6] bg-white px-3 text-sm outline-none focus:border-black"/></label>; }
function Select({ label, value, options, onChange }: { label:string; value:string; options:string[]; onChange:(value:string)=>void }) { return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span><select value={value} onChange={e=>onChange(e.target.value)} className="h-11 w-full rounded-lg border border-[#dfe2e6] bg-white px-3 text-sm">{options.map(x=><option key={x}>{x}</option>)}</select></label>; }

export function EnterpriseInterviewBuilder({ step }: { step:string }) {
  return <AuthGate role="enterprise"><BuilderInner step={step}/></AuthGate>;
}

function BuilderInner({ step }: { step:string }) {
  const draft=useEnterpriseInterviewStore();
  const router=useRouter();
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const index=STEPS.findIndex(x=>x[0]===step);
  const safeIndex=index<0?0:index;
  const [title,subtitle]=TITLES[step]??TITLES.basics;
  const validation=validateDraft(draft);

  async function persist(publish=false) {
    if(publish && validation.length){setMessage(validation[0]);return;}
    setSaving(true); setMessage(null);
    try { const publicCode=publish?(draft.publicCode??crypto.randomUUID().slice(0,8)):draft.publicCode; if(publicCode&&!draft.publicCode)draft.update({publicCode}); const id=await savePanel(draft.panelId,enterpriseDraftToPanelConfig({...draft,publicCode},publish)); draft.markSaved(id,publish); if(publish) router.push('/enterprise/builder/published'); else setMessage('Draft saved to RecruitPro.'); }
    catch(error){setMessage(error instanceof Error?error.message:'Could not save this interview.');}
    finally{setSaving(false);}
  }

  if(step==='published') return <PublishedInterview/>;

  const previous=safeIndex===0?'/enterprise/interviews':`/enterprise/builder/${STEPS[safeIndex-1][0]}`;
  const next=safeIndex===STEPS.length-1?null:`/enterprise/builder/${STEPS[safeIndex+1][0]}`;
  return <ConsoleShell flush>
    <div className="border-b border-[#e3e5e8] bg-white px-8 py-5"><div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-[#777c84]">Custom Panel Builder</p><b className="font-serif text-xl">{draft.title||'Untitled Interview'}</b></div><div className="flex items-center gap-3"><span className={`text-xs ${message?.includes('Could not')||message?.includes('required')?'text-red-700':'text-[#676c74]'}`}>{message??(draft.panelId?'Saved panel':'New draft')}</span><ConsoleButton variant="outline" onClick={()=>persist(false)}>{saving?'Saving…':<><Save size={15}/> Save Draft</>}</ConsoleButton></div></div><div className="mx-auto mt-5 flex max-w-[1180px] overflow-x-auto">{STEPS.map(([slug,label],i)=><Link href={`/enterprise/builder/${slug}`} key={slug} className={`min-w-max flex-1 border-b-2 px-3 pb-3 text-center text-xs font-semibold ${i<=safeIndex?'border-black text-black':'border-[#dfe2e6] text-[#8a8f96]'}`}><span className={`mr-2 inline-grid size-5 place-items-center rounded-full ${i<safeIndex?'bg-black text-white':i===safeIndex?'border border-black':'border border-[#ccd0d5]'}`}>{i<safeIndex?<Check size={12}/>:i+1}</span>{label}</Link>)}</div></div>
    <div className="mx-auto max-w-[1000px] px-8 py-9"><h1 className="font-serif text-3xl font-bold">{title}</h1><p className="mt-2 text-sm text-[#686d75]">{subtitle}</p><div className="mt-7">{renderStep(step,draft)}</div><div className="mt-8 flex justify-between border-t border-[#e1e4e7] pt-6"><ConsoleButton variant="outline" href={previous}><ArrowLeft size={15}/> Back</ConsoleButton>{next?<ConsoleButton href={next}>Continue <ArrowRight size={15}/></ConsoleButton>:<ConsoleButton onClick={()=>persist(true)}>{saving?'Publishing…':'Publish Interview'} <ArrowRight size={15}/></ConsoleButton>}</div></div>
  </ConsoleShell>;
}

function renderStep(step:string,draft:ReturnType<typeof useEnterpriseInterviewStore>) {
  if(step==='basics') return <ConsoleCard className="grid gap-6 p-7 md:grid-cols-2"><div className="md:col-span-2"><Input label="Interview title" value={draft.title} onChange={title=>draft.update({title})}/></div><Input label="Target role" value={draft.role} onChange={role=>draft.update({role})}/><Select label="Department" value={draft.department} options={['Engineering','Product','Design','Operations','Sales','People']} onChange={department=>draft.update({department})}/><Select label="Seniority" value={draft.seniority} options={['Entry level','Mid level','Mid / Senior','Senior / Staff','Leadership']} onChange={seniority=>draft.update({seniority})}/><Input type="number" label="Total duration (minutes)" value={draft.duration} onChange={duration=>draft.update({duration:Number(duration)})}/><label className="md:col-span-2"><span className="mb-2 block text-sm font-semibold">Description</span><textarea value={draft.description} onChange={e=>draft.update({description:e.target.value})} className="min-h-28 w-full rounded-lg border border-[#dfe2e6] p-3 text-sm"/></label><div className="md:col-span-2"><span className="mb-2 block text-sm font-semibold">Core skills</span><div className="flex flex-wrap gap-2">{draft.skills.map(skill=><span key={skill} className="flex items-center gap-2 rounded-md bg-[#eff1f3] px-3 py-2 text-sm">{skill}<button onClick={()=>draft.update({skills:draft.skills.filter(x=>x!==skill)})}>×</button></span>)}<button onClick={()=>{const skill=prompt('Skill name');if(skill?.trim())draft.update({skills:[...draft.skills,skill.trim()]});}} className="rounded-md border border-dashed border-[#babfc6] px-3 py-2 text-sm">+ Add skill</button></div></div></ConsoleCard>;
  if(step==='questions') return <div className="grid gap-5 lg:grid-cols-[1fr_280px]"><ConsoleCard className="p-6"><div className="mb-5 flex justify-between"><b className="font-serif text-xl">Available Questions</b><ConsoleButton onClick={draft.addQuestion}><Plus size={15}/> Add question</ConsoleButton></div>{draft.questions.map(q=><div key={q.id} className="border-t border-[#e5e7ea] py-5"><div className="flex gap-3"><input type="checkbox" checked={q.selected} onChange={e=>draft.updateQuestion(q.id,{selected:e.target.checked})} className="mt-1 size-4 accent-black"/><div className="flex-1"><textarea value={q.text} onChange={e=>draft.updateQuestion(q.id,{text:e.target.value})} className="min-h-16 w-full resize-none bg-transparent text-sm font-semibold outline-none"/><div className="flex gap-2"><select value={q.category} onChange={e=>draft.updateQuestion(q.id,{category:e.target.value})} className="rounded bg-[#f0f2f4] px-2 py-1 text-xs"><option>Technical depth</option><option>System design</option><option>Coding</option><option>Behavioral</option><option>Custom</option></select><select value={q.difficulty} onChange={e=>draft.updateQuestion(q.id,{difficulty:e.target.value})} className="rounded bg-[#f0f2f4] px-2 py-1 text-xs"><option>Easy</option><option>Medium</option><option>Hard</option></select></div></div><button onClick={()=>draft.removeQuestion(q.id)}><Trash2 size={16}/></button></div></div>)}</ConsoleCard><ConsoleCard className="h-fit p-6"><p className="text-sm font-semibold">Interview Script</p><strong className="mt-4 block font-serif text-3xl">{draft.questions.filter(q=>q.selected).length}</strong><p className="text-xs text-[#747981]">selected questions</p><p className="mt-5 text-xs leading-5 text-[#747981]">Selected questions become the panel&apos;s reviewed question bank and seed prompts.</p></ConsoleCard></div>;
  if(step==='ai') {const total=draft.interviewers.reduce((sum,agent)=>sum+agent.weight,0);const questionTotal=draft.interviewers.reduce((sum,agent)=>sum+Math.max(0,agent.maxTurns),0);return <div className="space-y-4"><ConsoleCard className="p-5 text-sm"><b className="font-serif text-base">Panel order is round-robin</b><p className="mt-1.5 leading-6 text-[#676c74]">There are no stages to arrange. Each interviewer asks up to its <b>Maximum questions</b>, and the host rotates to whichever interviewer is least satisfied so far — so a candidate who answers well early spends more time on the areas still in question. Across the panel that is <b>{questionTotal} question{questionTotal===1?'':'s'}</b> at most.</p></ConsoleCard><div className={`rounded-lg border p-4 text-sm ${total===100?'border-[#b8d9c2] bg-[#eff8f2]':'border-[#e8c98d] bg-[#fff8e8]'}`}><b>Total interviewer weight: {total}%</b> · Agent weights must total 100% before publishing.</div>{draft.interviewers.map((agent,i)=><InterviewerEditor key={agent.id} agent={agent} index={i} update={draft.updateInterviewer} remove={draft.removeInterviewer}/>)}<button onClick={draft.addInterviewer} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#bfc4ca] p-6 text-sm font-semibold"><Plus size={16}/> Add interviewer to panel</button></div>;}
  if(step==='candidate-settings') return <div className="space-y-5"><ConsoleCard className="grid gap-5 p-6 md:grid-cols-2"><Input type="number" label="Invitation expires after (days)" value={draft.candidateSettings.expiresInDays} onChange={value=>draft.update({candidateSettings:{...draft.candidateSettings,expiresInDays:Number(value)}})}/><Input type="number" label="Maximum attempts" value={draft.candidateSettings.attempts} onChange={value=>draft.update({candidateSettings:{...draft.candidateSettings,attempts:Number(value)}})}/></ConsoleCard><ConsoleCard className="p-6">{([['cameraRequired','Require camera'],['identityCheck','Photo identity check'],['integrityMonitoring','Browser integrity monitoring']] as const).map(([key,label])=><label key={key} className="flex justify-between border-b border-[#e5e7ea] py-4 last:border-0"><span className="text-sm font-semibold">{label}</span><input type="checkbox" checked={draft.candidateSettings[key]} onChange={e=>draft.update({candidateSettings:{...draft.candidateSettings,[key]:e.target.checked}})} className="size-4 accent-black"/></label>)}</ConsoleCard><ConsoleCard className="p-6"><label><span className="mb-2 block text-sm font-semibold">Candidate instructions</span><textarea value={draft.candidateSettings.instructions} onChange={e=>draft.update({candidateSettings:{...draft.candidateSettings,instructions:e.target.value}})} className="min-h-28 w-full rounded-lg border border-[#dfe2e6] p-3 text-sm"/></label></ConsoleCard></div>;
  return <Review draft={draft}/>;
}

/**
 * Pre-configured bank, or one of the recruiter's own.
 *
 * Choosing a personal bank copies its questions into the draft immediately
 * rather than storing a reference. A published interview must keep asking what
 * it was published with even if the bank is edited afterwards, and the
 * candidate's backend must never have to read a table that is owner-only by
 * design.
 */
function QuestionBankSelect({agent,update}:{agent:EnterpriseInterviewer;update:(id:string,patch:Partial<EnterpriseInterviewer>)=>void}) {
  const [banks,setBanks]=useState<UserBank[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;listUserBanks().then(rows=>{if(active)setBanks(rows)}).catch(()=>{/* the built-ins still work without them */});return()=>{active=false};},[]);

  const choose=async(value:string)=>{
    setError('');
    if(!isUserBankId(value)){update(agent.id,{questionBank:value,bankItems:undefined});return;}
    setBusy(true);
    try{
      const items=await listBankItems(bankIdToUuid(value));
      if(!items.length)throw new Error('That bank has no questions in it yet.');
      update(agent.id,{questionBank:value,bankItems:bankItemsToKnowledge(items)});
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setBusy(false);}
  };

  return <label><span className="mb-2 block text-sm font-semibold">Question bank</span>
    <select value={agent.questionBank} onChange={event=>void choose(event.target.value)} disabled={busy} className="h-11 w-full rounded-lg border border-[#dfe2e6] bg-white px-3 text-sm">
      <optgroup label="Pre-configured (random selection each session)">
        <option value="dsa">DSA &amp; algorithms</option>
        <option value="system-design">System design</option>
        <option value="behavioural">Behavioural</option>
      </optgroup>
      <optgroup label="My question banks">
        {banks.length
          ? banks.map(bank=><option key={bank.id} value={userBankId(bank.id)}>{bank.name} ({bank.item_count ?? 0})</option>)
          : <option disabled value="">None yet — create one under Question Banks</option>}
      </optgroup>
      <optgroup label="Other">
        <option value="custom">This panel&apos;s own question list</option>
      </optgroup>
    </select>
    {busy&&<span className="mt-1 block text-xs text-[#858a92]">Loading questions…</span>}
    {isUserBankId(agent.questionBank)&&!busy&&<span className="mt-1 block text-xs text-[#858a92]">{agent.bankItems?.length ?? 0} question(s) copied into this panel.</span>}
    {error&&<span className="mt-1 block text-xs text-red-700">{error}</span>}
  </label>;
}

function InterviewerEditor({agent,index,update,remove}:{agent:EnterpriseInterviewer;index:number;update:(id:string,patch:Partial<EnterpriseInterviewer>)=>void;remove:(id:string)=>void}) { const roles:RoleType[]=['Technical','Product','Hiring manager','Customer','Behavioural','Custom'];return <ConsoleCard className="p-6"><div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#e6ecf5]"><UserRound size={19}/></span><div><h2 className="font-serif text-xl font-bold">Interviewer {index+1}</h2><p className="text-xs text-[#747981]">{index===0?'Opens the interview':'Receives a panel handoff'}</p></div></div><button onClick={()=>remove(agent.id)}><Trash2 size={17}/></button></div><div className="grid gap-5 md:grid-cols-2"><Input label="Interviewer name" value={agent.name} onChange={name=>update(agent.id,{name})}/><Select label="Panel role" value={agent.role} options={roles} onChange={role=>update(agent.id,{role:role as RoleType})}/><QuestionBankSelect agent={agent} update={update}/><Select label="Voice" value={agent.voice} options={['Male · US English','Female · US English','Female · UK English','Male · Indian English','Neutral · English']} onChange={voice=>update(agent.id,{voice})}/><Input type="number" label="Maximum questions" value={agent.maxTurns} onChange={maxTurns=>update(agent.id,{maxTurns:Number(maxTurns)})}/><Input type="number" label="Final score weight (%)" value={agent.weight} onChange={weight=>update(agent.id,{weight:Math.max(0,Math.min(100,Number(weight)))})}/><label><span className="mb-2 block text-sm font-semibold">Scoring criteria</span><input value={agent.competencies.join(', ')} onChange={event=>update(agent.id,{competencies:event.target.value.split(',').map(value=>value.trim()).filter(Boolean)})} placeholder="Correctness, reasoning, communication" className="h-11 w-full rounded-lg border border-[#dfe2e6] bg-white px-3 text-sm"/></label><label className="md:col-span-2"><span className="mb-2 block text-sm font-semibold">System instructions</span><textarea value={agent.prompt} onChange={e=>update(agent.id,{prompt:e.target.value})} className="min-h-28 w-full rounded-lg border border-[#dfe2e6] p-3 text-sm"/></label><label className="md:col-span-2"><span className="mb-2 block text-sm font-semibold">Opening message</span><textarea value={agent.opening} onChange={e=>update(agent.id,{opening:e.target.value})} className="min-h-20 w-full rounded-lg border border-[#dfe2e6] p-3 text-sm"/></label></div></ConsoleCard>;}

function Review({draft}:{draft:ReturnType<typeof useEnterpriseInterviewStore>}) { const criteriaCount=draft.interviewers.reduce((sum,agent)=>sum+agent.competencies.length,0);const rows=[['Interview',`${draft.title} · ${draft.role}`],['Panel order',`Round-robin · up to ${draft.interviewers.reduce((sum,agent)=>sum+Math.max(0,agent.maxTurns),0)} questions across ${draft.interviewers.length} interviewer(s)`],['Questions',`${draft.questions.filter(q=>q.selected).length} selected`],['Panel & scoring',`${draft.interviewers.length} AI interviewers · ${criteriaCount} agent-owned criteria · ${draft.interviewers.reduce((sum,agent)=>sum+agent.weight,0)}% total weight`],['Candidate access',`${draft.candidateSettings.expiresInDays} day expiry · ${draft.candidateSettings.attempts} attempt(s)`]]; const errors=validateDraft(draft);return <div className="space-y-4">{rows.map((row,i)=><ConsoleCard key={row[0]} className="flex items-center gap-4 p-5"><span className="grid size-9 place-items-center rounded-full bg-[#e9f5ed] text-[#2f7d47]"><Check size={17}/></span><div className="flex-1"><b>{row[0]}</b><p className="mt-1 text-xs text-[#737880]">{row[1]}</p></div><Link href={`/enterprise/builder/${STEPS[Math.min(i,STEPS.length-2)][0]}`} className="text-sm font-semibold">Edit</Link></ConsoleCard>)}{errors.length>0&&<ConsoleCard className="border-[#e3b55e] bg-[#fff9ea] p-5"><b className="text-sm">Before you publish</b><ul className="mt-2 list-disc pl-5 text-sm text-[#755316]">{errors.map(x=><li key={x}>{x}</li>)}</ul></ConsoleCard>}<ConsoleCard className="border-black bg-[#f2f3f4] p-6"><h2 className="font-serif text-xl font-bold">Ready to publish?</h2><p className="mt-1 text-sm text-[#676c74]">Publishing saves the panel to Supabase and creates a candidate invitation link.</p></ConsoleCard></div>;}

function validateDraft(draft:ReturnType<typeof useEnterpriseInterviewStore>) { const errors:string[]=[];if(!draft.title.trim())errors.push('An interview title is required.');if(!draft.role.trim())errors.push('A target role is required.');if(draft.interviewers.some(agent=>!Number.isFinite(agent.maxTurns)||agent.maxTurns<1))errors.push('Every interviewer needs a maximum question count of at least 1.');if(draft.interviewers.some(agent=>agent.questionBank==='custom')&&!draft.questions.some(q=>q.selected))errors.push('Select at least one question for interviewers using the Custom bank.');if(!draft.interviewers.length)errors.push('Add at least one interviewer to the panel.');if(draft.interviewers.some(agent=>!agent.competencies.length))errors.push('Every interviewer needs at least one scoring criterion.');if(draft.interviewers.reduce((sum,agent)=>sum+agent.weight,0)!==100)errors.push('Interviewer weights must total exactly 100%.');return errors;}

// eslint-disable-next-line @next/next/no-location-assign-relative-destination
function PublishedInterview(){const draft=useEnterpriseInterviewStore();return <ConsoleShell flush><div className="grid min-h-[calc(100vh-74px)] place-items-center px-8"><div className="w-full max-w-[700px] text-center"><span className="mx-auto grid size-20 place-items-center rounded-full bg-[#e7f5eb] text-[#2b7c44]"><CheckCircle2 size={40}/></span><h1 className="mt-6 font-serif text-4xl font-bold">Interview Published</h1><p className="mt-3 text-sm text-[#686d75]">{draft.title} is live. Invite candidates to generate their links.</p><ConsoleCard className="mt-7 p-6 text-left"><p className="text-xs font-semibold uppercase tracking-wider text-[#777c84]">How candidates get in</p><p className="mt-3 text-sm leading-6 text-[#50555d]">There is no single shared link. Each candidate you invite receives their own, tied to their email address and revocable on its own. Add them on the Invitations screen.</p></ConsoleCard><div className="mt-5 flex justify-center gap-3"><ConsoleButton href="/enterprise/invitations">Invite Candidates</ConsoleButton><ConsoleButton href={`/enterprise/interviews/${draft.panelId??'frontend-architect'}`} variant="outline">View Interview</ConsoleButton><ConsoleButton href="/enterprise/interviews" variant="outline">All Interviews</ConsoleButton></div><button onClick={()=>{draft.reset();location.href='/enterprise/builder/basics';}} className="mt-7 text-sm font-semibold">Create another custom panel</button></div></div></ConsoleShell>;}
