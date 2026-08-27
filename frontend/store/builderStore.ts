import { create } from 'zustand';

export type RoleType = 'Technical' | 'Hiring manager' | 'Product' | 'Customer' | 'Behavioural' | 'Custom';

export interface Agent {
  id: string;
  isNew?: boolean;
  identity: {
    name: string;
    role: RoleType;
    color: string;
    avatar: string;
  };
  voice: {
    provider: string;
    voiceId: string;
    language: string;
    speakingStyle: string;
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
  };
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
  agents: Agent[];
  scorer: Scorer;
  selectedAgentId: string | 'scorer' | null;
  isSaved: boolean;
  
  // Actions
  setProjectName: (name: string) => void;
  addAgent: (role?: RoleType) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  deleteAgent: (id: string) => void;
  selectAgent: (id: string | 'scorer' | null) => void;
  updateScorer: (updates: Partial<Scorer>) => void;
  saveProject: () => void;
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

export const useBuilderStore = create<BuilderState>((set) => ({
  projectName: '',
  agents: [],
  scorer: { competencies: [] },
  selectedAgentId: null,
  isSaved: true,

  setProjectName: (name) => set({ projectName: name, isSaved: false }),
  
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
      voice: {
        provider: 'elevenlabs',
        voiceId: 'default',
        language: 'en-US',
        speakingStyle: 'professional',
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
      },
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
    // In a real app, API call here.
    console.log('Saving project...');
    set({ isSaved: true });
  }
}));
