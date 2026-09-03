'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Agent, RoleType } from '@/store/builderStore';
import { defaultCompetencies, defaultSystemPrompts, emptyKnowledge, roleColors } from '@/store/builderStore';
import { withEnterpriseQuestionBank, type PanelConfig } from '@/lib/panels';
import { inferQuestionDomain } from '@/lib/questionDomains';

export type EnterpriseStage = { id: string; title: string; duration: number };
export type EnterpriseQuestion = { id: string; text: string; category: string; difficulty: string; selected: boolean };
export type EnterpriseInterviewer = { id: string; name: string; role: RoleType; voice: string; prompt: string; opening: string; maxTurns: number; weight: number; competencies: string[]; questionBank: 'dsa' | 'system-design' | 'custom' };

type DraftSnapshot = {
  panelId: string | null;
  title: string;
  role: string;
  department: string;
  seniority: string;
  duration: number;
  description: string;
  skills: string[];
  language: string;
  stages: EnterpriseStage[];
  questions: EnterpriseQuestion[];
  interviewers: EnterpriseInterviewer[];
  candidateSettings: {
    expiresInDays: number;
    attempts: number;
    cameraRequired: boolean;
    identityCheck: boolean;
    integrityMonitoring: boolean;
    instructions: string;
  };
  status: 'draft' | 'published';
  publishedAt?: string;
  publicCode?: string;
};

export type EnterpriseDraftStore = DraftSnapshot & {
  update: (patch: Partial<DraftSnapshot>) => void;
  reset: () => void;
  applyTemplate: (template: 'blank' | 'frontend' | 'product' | 'system-design') => void;
  addStage: () => void;
  updateStage: (id: string, patch: Partial<EnterpriseStage>) => void;
  removeStage: (id: string) => void;
  addQuestion: () => void;
  updateQuestion: (id: string, patch: Partial<EnterpriseQuestion>) => void;
  removeQuestion: (id: string) => void;
  addInterviewer: () => void;
  updateInterviewer: (id: string, patch: Partial<EnterpriseInterviewer>) => void;
  removeInterviewer: (id: string) => void;
  loadConfig: (panelId: string, config: PanelConfig) => void;
  markSaved: (panelId: string, published?: boolean) => void;
};

const defaultDraft = (): DraftSnapshot => ({
  panelId: null,
  title: 'Frontend Architect Technical Screen',
  role: 'Frontend Architect',
  department: 'Engineering',
  seniority: 'Senior / Staff',
  duration: 60,
  description: 'Evaluate architecture, React expertise, problem solving, and technical communication.',
  skills: ['React', 'TypeScript', 'System Design', 'Web Performance'],
  language: 'en-US',
  stages: [
    { id: 'intro', title: 'Introduction & Warm-up', duration: 5 },
    { id: 'technical', title: 'Technical Screen', duration: 20 },
    { id: 'coding', title: 'Live Coding Challenge', duration: 25 },
    { id: 'candidate', title: 'Candidate Questions', duration: 10 },
  ],
  questions: [
    { id: 'react-reconciliation', text: "Explain React's reconciliation process and the role of stable keys.", category: 'Technical depth', difficulty: 'Medium', selected: true },
    { id: 'frontend-state', text: 'Design state management for a large collaborative frontend application.', category: 'System design', difficulty: 'Hard', selected: true },
    { id: 'lru-cache', text: 'Implement an LRU cache with a fixed capacity.', category: 'Coding', difficulty: 'Medium', selected: true },
    { id: 'trade-off', text: 'Tell me about a difficult technical trade-off you made.', category: 'Behavioral', difficulty: 'Medium', selected: true },
  ],
  interviewers: [
    { id: 'technical-interviewer', name: 'Marcus', role: 'Technical', voice: 'Male · US English', prompt: defaultSystemPrompts.Technical, opening: 'Welcome. I will lead the technical portion of your interview.', maxTurns: 5, weight: 60, competencies: defaultCompetencies.Technical, questionBank: 'dsa' },
    { id: 'behavioral-interviewer', name: 'Sarah', role: 'Behavioural', voice: 'Female · UK English', prompt: defaultSystemPrompts.Behavioural, opening: 'Hello. I will ask about your experience and collaboration style.', maxTurns: 4, weight: 40, competencies: defaultCompetencies.Behavioural, questionBank: 'custom' },
  ],
  candidateSettings: { expiresInDays: 7, attempts: 1, cameraRequired: true, identityCheck: true, integrityMonitoring: false, instructions: 'Find a quiet space, test your microphone and camera, and set aside 60 uninterrupted minutes.' },
  status: 'draft',
});

const uid = () => crypto.randomUUID();

const VOICE_IDS: Record<string, string> = {
  'Male · US English': 'English_Trustworth_Man',
  'Female · US English': 'English_ConfidentWoman',
  'Female · UK English': 'English_Graceful_Lady',
  'Male · Indian English': 'English_Steadymentor',
  'Neutral · English': 'English_WiseScholar',
};

const VOICE_LABELS = Object.fromEntries(
  Object.entries(VOICE_IDS).map(([label, id]) => [id, label]),
) as Record<string, string>;

function questionsForInterviewer(
  interviewer: EnterpriseInterviewer,
  questions: EnterpriseQuestion[],
): EnterpriseQuestion[] {
  const selected = questions.filter(question => question.selected);
  if (interviewer.role === 'Behavioural' || interviewer.role === 'Hiring manager') {
    return selected.filter(question => inferQuestionDomain(question.category, question.text) === 'behavioural');
  }
  if (interviewer.questionBank === 'custom' && interviewer.role === 'Technical') {
    return selected.filter(question => ['dsa', 'system_design', 'general'].includes(
      inferQuestionDomain(question.category, question.text),
    ));
  }
  return selected;
}

function normalizedPercentages(values: number[]): number[] {
  if (!values.length) return [];
  const positive = values.map(value => Number.isFinite(value) && value > 0 ? value : 0);
  const source = positive.some(Boolean) ? positive : positive.map(() => 1);
  const total = source.reduce((sum, value) => sum + value, 0);
  const percentages = source.map((value, index) => index === source.length - 1 ? 0 : Math.round(value / total * 100));
  percentages[percentages.length - 1] = 100 - percentages.slice(0, -1).reduce((sum, value) => sum + value, 0);
  return percentages;
}

function interviewersFromConfig(config: PanelConfig): EnterpriseInterviewer[] {
  const legacyRules = new Map(config.scorer.competencies.map(rule => [rule.name, rule.weight]));
  const rawWeights = config.agents.map(agent => agent.scoring.weight ?? (
    agent.scoring.competencies.reduce((sum, name) => sum + (legacyRules.get(name) ?? 0), 0) || 1
  ));
  const percentages = normalizedPercentages(rawWeights);
  return config.agents.map((agent, index) => ({
    id: agent.id,
    name: agent.identity.name,
    role: agent.identity.role,
    voice: VOICE_LABELS[agent.voice?.voiceId ?? ''] ?? 'Neutral · English',
    prompt: agent.behavior.systemPrompt,
    opening: agent.behavior.greetingMessage,
    maxTurns: agent.logic.maxTurns,
    weight: percentages[index],
    competencies: agent.scoring.competencies.length ? agent.scoring.competencies : defaultCompetencies[agent.identity.role],
    questionBank: agent.knowledge.bankId ?? 'custom',
  }));
}

function upgradePersistedDraft(value: unknown): DraftSnapshot {
  const current = defaultDraft();
  const saved = (value && typeof value === 'object' ? value : {}) as Partial<DraftSnapshot>;
  const interviewers = saved.interviewers?.length
    ? saved.interviewers.map(interviewer => ({
        ...interviewer,
        competencies: interviewer.competencies?.length ? interviewer.competencies : defaultCompetencies[interviewer.role],
        questionBank: interviewer.questionBank ?? (/system\s*design/i.test(`${interviewer.name} ${interviewer.prompt}`) ? 'system-design' : interviewer.role === 'Technical' ? 'dsa' : 'custom'),
      }))
    : current.interviewers;
  const weights = normalizedPercentages(interviewers.map(interviewer => interviewer.weight ?? 0));
  return { ...current, ...saved, interviewers: interviewers.map((interviewer, index) => ({ ...interviewer, weight: weights[index] })) };
}

const enterpriseInterviewStore = create<EnterpriseDraftStore>()(persist((set) => ({
  ...defaultDraft(),
  update: (patch) => set(patch),
  reset: () => set(defaultDraft()),
  applyTemplate: (template) => set(() => {
    const next = defaultDraft();
    if (template === 'blank') return { ...next, title: 'Untitled Interview', role: '', description: '', skills: [], stages: [], questions: [], interviewers: [] };
    if (template === 'product') return { ...next, panelId: null, title: 'Product Manager — Tier 1', role: 'Product Manager', department: 'Product', seniority: 'Mid / Senior', skills: ['Product Sense','Execution','Analytics','Communication'], interviewers: [{ id:'product-interviewer', name:'Maya', role:'Product' as RoleType, voice:'Female · US English', prompt:defaultSystemPrompts.Product, opening:'Welcome. Let us begin with a product scenario.', maxTurns:6, weight:100, competencies:defaultCompetencies.Product, questionBank:'custom' as const }], status:'draft' as const };
    if (template === 'system-design') return { ...next, panelId: null, title: 'System Design Expert', role: 'Senior Software Engineer', skills: ['System Design','Scalability','Reliability','Communication'], interviewers: next.interviewers.map((agent,index)=>({...agent,questionBank:index===0?'system-design' as const:'custom' as const})), status:'draft' as const };
    return { ...next, panelId: null, status:'draft' as const };
  }),
  addStage: () => set(s => ({ stages:[...s.stages,{id:uid(),title:'New Interview Stage',duration:10}] })),
  updateStage: (id, patch) => set(s => ({ stages:s.stages.map(x=>x.id===id?{...x,...patch}:x) })),
  removeStage: (id) => set(s => ({ stages:s.stages.filter(x=>x.id!==id) })),
  addQuestion: () => set(s => ({ questions:[...s.questions,{id:uid(),text:'New interview question',category:'Custom',difficulty:'Medium',selected:true}] })),
  updateQuestion: (id, patch) => set(s => ({ questions:s.questions.map(x=>x.id===id?{...x,...patch}:x) })),
  removeQuestion: (id) => set(s => ({ questions:s.questions.filter(x=>x.id!==id) })),
  addInterviewer: () => set(s => ({ interviewers:[...s.interviewers,{id:uid(),name:'New Interviewer',role:'Custom',voice:'Neutral · English',prompt:defaultSystemPrompts.Custom,opening:'Hello, are you ready to begin?',maxTurns:4,weight:0,competencies:defaultCompetencies.Custom,questionBank:'custom'}] })),
  updateInterviewer: (id, patch) => set(s => ({ interviewers:s.interviewers.map(x=>x.id===id?{...x,...patch}:x) })),
  removeInterviewer: (id) => set(s => ({ interviewers:s.interviewers.filter(x=>x.id!==id) })),
  loadConfig: (panelId, config) => set(() => {
    const base=defaultDraft(); const meta=config.enterprise;
    return { ...base, panelId, title:config.projectName, language:config.language, interviewers:interviewersFromConfig(config), ...(meta?{role:meta.role,department:meta.department,seniority:meta.seniority,duration:meta.duration,description:meta.description,skills:meta.skills,stages:meta.stages,questions:meta.questions,candidateSettings:meta.candidateSettings,status:meta.status==='published'?'published' as const:'draft' as const,publishedAt:meta.publishedAt,publicCode:meta.publicCode}:{}) };
  }),
  markSaved: (panelId, published=false) => set(s => ({ panelId, status:published?'published':s.status, publishedAt:published?new Date().toISOString():s.publishedAt, publicCode:published?(s.publicCode??uid().slice(0,8)):s.publicCode })),
}), { name:'recruitpro-interview-draft', version:2, migrate: upgradePersistedDraft }));

export const useEnterpriseInterviewStore = enterpriseInterviewStore as typeof enterpriseInterviewStore & (() => EnterpriseDraftStore);

export function enterpriseDraftToPanelConfig(draft: DraftSnapshot, publish: boolean): PanelConfig {
  const agents: Agent[] = draft.interviewers.map((interviewer,index) => {
    const assignedQuestions = questionsForInterviewer(interviewer, draft.questions);
    return ({
    id:interviewer.id,
    identity:{name:interviewer.name,role:interviewer.role,color:roleColors[interviewer.role],avatar:''},
    voice:{provider:'minimax',voiceId:VOICE_IDS[interviewer.voice],language:draft.language,speakingStyle:'professional'},
    behavior:{systemPrompt:interviewer.prompt,greetingMessage:interviewer.opening,fallbackMessage:"I didn't catch that. Could you rephrase?",scenarioBrief:draft.description},
    logic:{difficultyBand:[3,7],seedQuestions:assignedQuestions.map(q=>q.text),followUpAggressiveness:5,maxTurns:interviewer.maxTurns,maxVisits:1},
    knowledge:{...emptyKnowledge(),bankId:interviewer.questionBank,items:interviewer.questionBank==='custom'?assignedQuestions.map(q=>({id:q.id,question:q.text,idealAnswer:"Evaluate against the current interviewer's configured criteria.",tags:[q.category,q.difficulty],kind:/coding/i.test(q.category)?'coding' as const:/system design/i.test(q.category)?'written' as const:'verbal' as const,domain:inferQuestionDomain(q.category,q.text)})):[]},
    skills:{rolePlayMode:false,loopUntilSatisfied:false,contradictionProbing:true},tools:[],
    turnTaking:{canOpen:index===0,handoffTriggers:'When the current stage is complete.',priority:index===0?'high':'medium'},
    scoring:{competencies:interviewer.competencies,weight:interviewer.weight/100},
  }); });
  return withEnterpriseQuestionBank({ projectName:draft.title, language:draft.language, agents, scorer:{competencies:[]}, enterprise:{status:publish?'published':'draft',role:draft.role,department:draft.department,seniority:draft.seniority,duration:draft.duration,description:draft.description,skills:draft.skills,stages:draft.stages,questions:draft.questions,candidateSettings:draft.candidateSettings,publishedAt:publish?new Date().toISOString():draft.publishedAt,publicCode:draft.publicCode??uid().slice(0,8)} });
}
