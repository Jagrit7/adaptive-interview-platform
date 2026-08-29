import { create } from 'zustand';
import { DEFAULT_LANGUAGE } from '@/lib/languages';

export type RoleType = 'Technical' | 'Hiring manager' | 'Product' | 'Customer' | 'Behavioural' | 'Custom';

export type KnowledgeMode = 'llm' | 'knowledge_base';

export interface KnowledgeItem {
  id: string;
  question: string;
  idealAnswer: string;
  tags: string[];
  difficulty?: number | null;
}

export interface Knowledge {
  /** 'llm' = the agent writes its own questions. 'knowledge_base' = it is fed
   *  questions from `items` and graded against their ideal answers. */
  mode: KnowledgeMode;
  /** knowledge_base only: true = ask nothing outside the bank; false = work
   *  through the bank first, then improvise. */
  strict: boolean;
  sourceName: string;
  items: KnowledgeItem[];
}

export interface Agent {
  id: string;
  isNew?: boolean;
  identity: {
    name: string;
    role: RoleType;
    color: string;
    avatar: string;
  };
  behavior: {
    systemPrompt: string;
    greetingMessage: string;
    fallbackMessage: string;
    scenarioBrief: string;
  };
  logic: {
    difficultyBand: [number, number];
    seedQuestions: string[];
    followUpAggressiveness: number;
    maxTurns: number;
    maxVisits: number;
  };
  knowledge: Knowledge;
  skills: {
    rolePlayMode: boolean;
    loopUntilSatisfied: boolean;
    contradictionProbing: boolean;
  };
  tools: string[];
  turnTaking: {
    canOpen: boolean;
    handoffTriggers: string;
    priority: 'low' | 'medium' | 'high';
  };
  scoring: {
    competencies: string[];
  };
}

export interface CompetencyRule {
  name: string;
  weight: number;
  threshold: number;
}

export interface Scorer {
  competencies: CompetencyRule[];
}

interface BuilderState {
  projectName: string;
  /** One language for the whole panel, not per agent.
   *
   *  The session runs a single Agora agent instance. Its STT language is fixed
   *  at Join time and session.update() cannot change it (the SDK's
   *  UpdateAgentsRequestProperties only accepts token/llm/mllm), so a
   *  mixed-language panel is not something the backend can actually honour.
   *  Keeping it panel-level means the UI cannot offer a state that silently
   *  fails at runtime. */
  language: string;
  agents: Agent[];
  scorer: Scorer;
  selectedAgentId: string | 'scorer' | null;
  isSaved: boolean;
  activeSpeakerId: string | 'user' | null;

  // Actions
  setProjectName: (name: string) => void;
  setLanguage: (code: string) => void;
  addAgent: (role?: RoleType) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  updateKnowledge: (id: string, updates: Partial<Knowledge>) => void;
  deleteAgent: (id: string) => void;
  selectAgent: (id: string | 'scorer' | null) => void;
  updateScorer: (updates: Partial<Scorer>) => void;
  saveProject: () => void;
  setActiveSpeakerId: (id: string | 'user' | null) => void;
}

export const roleColors: Record<RoleType, string> = {
  'Technical': 'var(--accent-indigo)',
  'Product': 'var(--accent-amber)',
  'Hiring manager': 'var(--accent-teal)',
  'Customer': 'var(--accent-rose)',
  'Behavioural': 'var(--accent-violet)',
  'Custom': 'var(--text-primary)'
};

export const defaultSystemPrompts: Record<RoleType, string> = {
  'Technical': 'You are a Senior Software Engineer conducting a technical interview. Focus on system design, data structures, and algorithms.',
  'Product': 'You are a Product Manager evaluating business sense, product intuition, and cross-functional collaboration.',
  'Hiring manager': 'You are the Hiring Manager. You focus on team fit, long-term potential, and leadership principles.',
  'Customer': 'You are an enterprise customer participating in a role-play scenario. You are demanding but fair, looking for solutions to your specific business problems.',
  'Behavioural': 'You are an HR representative conducting a behavioral interview using the STAR method.',
  'Custom': 'You are a helpful interview agent. Please configure my instructions.'
};

export const emptyKnowledge = (): Knowledge => ({
  mode: 'llm',
  strict: true,
  sourceName: '',
  items: [],
});

export const useBuilderStore = create<BuilderState>((set) => ({
  projectName: '',
  language: DEFAULT_LANGUAGE,
  agents: [],
  scorer: { competencies: [] },
  selectedAgentId: null,
  isSaved: true,
  activeSpeakerId: null,

  setProjectName: (name) => set({ projectName: name, isSaved: false }),

  setLanguage: (code) => set({ language: code, isSaved: false }),

  addAgent: (role = 'Technical') => set((state) => {
    const newAgent: Agent = {
      id: crypto.randomUUID(),
      isNew: true,
      identity: {
        name: `New ${role} Agent`,
        role: role,
        color: roleColors[role],
        avatar: '',
      },
      behavior: {
        systemPrompt: defaultSystemPrompts[role],
        greetingMessage: 'Hello, are you ready to begin?',
        fallbackMessage: "I didn't quite catch that. Could you rephrase?",
        scenarioBrief: '',
      },
      logic: {
        difficultyBand: [3, 7],
        seedQuestions: [],
        followUpAggressiveness: 5,
        maxTurns: 5,
        maxVisits: 3,
      },
      knowledge: emptyKnowledge(),
      skills: {
        rolePlayMode: false,
        loopUntilSatisfied: true,
        contradictionProbing: false,
      },
      tools: [],
      turnTaking: {
        canOpen: false,
        handoffTriggers: '',
        priority: 'medium',
      },
      scoring: {
        competencies: [],
      },
    };
    return {
      agents: [...state.agents, newAgent],
      selectedAgentId: newAgent.id,
      isSaved: false,
    };
  }),

  updateAgent: (id, updates) => set((state) => ({
    agents: state.agents.map((agent) =>
      agent.id === id ? { ...agent, ...updates } : agent
    ),
    isSaved: false,
  })),

  // Knowledge gets its own action because the generic handleChange in
  // AgentConfigForm writes one field at a time, and an upload has to replace
  // sourceName + items together or the two briefly disagree.
  updateKnowledge: (id, updates) => set((state) => ({
    agents: state.agents.map((agent) =>
      agent.id === id
        ? { ...agent, knowledge: { ...agent.knowledge, ...updates } }
        : agent
    ),
    isSaved: false,
  })),

  deleteAgent: (id) => set((state) => ({
    agents: state.agents.filter((a) => a.id !== id),
    selectedAgentId: state.selectedAgentId === id ? null : state.selectedAgentId,
    isSaved: false,
  })),

  selectAgent: (id) => set({ selectedAgentId: id }),

  updateScorer: (updates) => set((state) => ({
    scorer: { ...state.scorer, ...updates },
    isSaved: false,
  })),

  saveProject: () => {
    // Still a stub - Supabase steps 13-15 (auth UI + upsert) are the open item.
    // When wired, the payload is { projectName, language, agents, scorer }:
    // knowledge lives inside each agent, so it goes into the existing jsonb
    // `config` column with no new storage layer.
    console.log('Saving project...');
    set({ isSaved: true });
  },

  setActiveSpeakerId: (id) => set({ activeSpeakerId: id }),
}));
