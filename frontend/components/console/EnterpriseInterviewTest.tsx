'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { AuthGate } from '@/components/ui/AuthGate';
import { loadPanel, withEnterpriseQuestionBank, type PanelConfig } from '@/lib/panels';
import { enterpriseDraftToPanelConfig, useEnterpriseInterviewStore } from '@/store/enterpriseInterviewStore';

const InterviewRoomLive = dynamic(() => import('@/app/interview-room/InterviewRoomLive'), { ssr:false });

export function EnterpriseInterviewTest({ panelId }: { panelId:string }) {
  return <AuthGate role="enterprise"><TestLoader panelId={panelId}/></AuthGate>;
}

function TestLoader({ panelId }: { panelId:string }) {
  const [config,setConfig]=useState<PanelConfig|null>(() => (
    panelId === 'frontend-architect'
      ? enterpriseDraftToPanelConfig(useEnterpriseInterviewStore.getState(), false)
      : null
  ));
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if (panelId === 'frontend-architect') return;
    let active=true;
    loadPanel(panelId)
      .then(row=>{if(active)setConfig(withEnterpriseQuestionBank(row.config));})
      .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:String(reason));});
    return()=>{active=false;};
  },[panelId]);

  if(error) return <div className="grid min-h-screen place-items-center bg-[#f7f8fa] p-8 text-center"><div><h1 className="font-serif text-3xl font-bold">Test could not start</h1><p className="mt-3 max-w-md text-sm text-[#676c74]">{error}</p><Link href={`/enterprise/interviews/${panelId}`} className="mt-6 inline-flex rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white">Return to interview</Link></div></div>;
  if(!config) return <div className="grid min-h-screen place-items-center bg-[#0f131d] text-sm text-[#aeb5c7]">Loading candidate experience…</div>;

  return <InterviewRoomLive panelOverride={config} overridePanelId={panelId} exitHref={`/enterprise/interviews/${panelId}`} testMode/>;
}

export function openInterviewTest(panelId:string) {
  const width=Math.min(1440,window.screen.availWidth-80);
  const height=Math.min(960,window.screen.availHeight-80);
  window.open(`/enterprise/interviews/${panelId}/test`,'recruitpro-interview-test',`popup=yes,width=${width},height=${height},left=40,top=40,resizable=yes,scrollbars=yes`);
}
