import { create } from 'zustand';
import { DEFAULT_LANGUAGE } from '@/lib/languages';
import { loadPanel, savePanel, type PanelConfig } from '@/lib/panels';

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

  /** Supabase row id. Null until first save; holding it is what makes the
   *  second save an UPDATE rather than a duplicate INSERT. */
  panelId: string | null;
  isSaving: boolean;
  saveError: string | null;
  lastSavedAt: number | null;

  // Actions
  setProjectName: (name: string) => void;
  setLanguage: (code: string) => void;
  addAgent: (role?: RoleType) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  updateKnowledge: (id: string, updates: Partial<Knowledge>) => void;
  deleteAgent: (id: string) => void;
  selectAgent: (id: string | 'scorer' | null) => void;
  updateScorer: (updates: Partial<Scorer>) => void;
  saveProject: () => Promise<void>;
  openPanel: (id: string) => Promise<void>;
  newPanel: () => void;
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

/**
 * Competencies pre-filled when an agent is created, by role.
 *
 * These are defaults, not constraints - the field is editable and the user can
 * replace them entirely. They exist because an agent with NO competencies is a
 * trap: it has nothing to measure, so it contributes nothing to the final
 * score, and until recently it was also retired from the panel after a single
 * question. A sensible starting set means the common case works without anyone
 * having to know that.
 */
export const defaultCompetencies: Record<RoleType, string[]> = {
  'Technical': ['System Design', 'Problem Solving', 'Technical Depth'],
  'Product': ['Product Sense', 'Prioritisation', 'Business Judgement'],
  'Hiring manager': ['Ownership', 'Collaboration', 'Role Fit'],
  'Customer': ['Customer Empathy', 'Handling Objections', 'Clarity'],
  'Behavioural': ['Communication', 'Self-Awareness', 'Resilience'],
  'Custom': ['Communication'],
};

/** Default scoring rule for a competency that has no rule yet.
 *  Equal weight, and a threshold that is visible rather than the silent 0.7
 *  the backend would otherwise apply. */
export const defaultCompetencyRule = (name: string): CompetencyRule => ({
  name,
  weight: 1,
  threshold: 0.7,
});

export const emptyKnowledge = (): Knowledge => ({
  mode: 'llm',
  strict: true,
  sourceName: '',
  items: [],
});

export const useBuilderStore = create<BuilderState>((set, get) => ({
  projectName: '',
  language: DEFAULT_LANGUAGE,
  agents: [],
  scorer: { competencies: [] },
  selectedAgentId: null,
  isSaved: true,
  activeSpeakerId: null,
  panelId: null,
  isSaving: false,
  saveError: null,
  lastSavedAt: null,

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
        // The FIRST agent in a panel opens the interview by default.
        //
        // This used to be false for every agent, which meant a freshly built
        // panel could never start: /sessions/start rejects a panel where nobody
        // has canOpen, and the toggle is buried on the last builder step. You
        // had to already know it existed to get past the error. Still editable -
        // this only changes what a new panel starts out as.
        canOpen: state.agents.length === 0,
        handoffTriggers: '',
        priority: state.agents.length === 0 ? 'high' : 'medium',
      },
      scoring: {
        competencies: defaultCompetencies[role] ?? defaultCompetencies['Custom'],
      },
    };

    // Every competency needs a rule, or the backend silently applies a 0.7
    // threshold and a weight of 1 that nobody chose and nobody can see.
    const known = new Set(state.scorer.competencies.map((c) => c.name));
    const added = newAgent.scoring.competencies
      .filter((name) => !known.has(name))
      .map(defaultCompetencyRule);

    return {
      agents: [...state.agents, newAgent],
      scorer: added.length
        ? { ...state.scorer, competencies: [...state.scorer.competencies, ...added] }
        : state.scorer,
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

  saveProject: async () => {
    const { projectName, language, agents, scorer, panelId, isSaving } = get();

    // The header Save button and the Finish button both call this. On a slow
    // connection the second call would still see panelId === null and insert a
    // duplicate row, so re-entrancy is blocked rather than deduplicated later.
    if (isSaving) return;

    set({ isSaving: true, saveError: null });
    try {
      const config: PanelConfig = { projectName, language, agents, scorer };
      const id = await savePanel(panelId, config);
      set({ panelId: id, isSaved: true, isSaving: false, lastSavedAt: Date.now() });
    } catch (err) {
      // isSaved deliberately stays false: the UI must keep showing unsaved
      // changes, because that is the truth. A save that silently fails while
      // the UI reads "Saved" is worse than no save at all.
      set({ isSaving: false, saveError: err instanceof Error ? err.message : String(err) });
    }
  },

  openPanel: async (id) => {
    const row = await loadPanel(id);
    const config = row.config ?? ({} as PanelConfig);
    set({
      panelId: row.id,
      projectName: config.projectName ?? row.project_name ?? '',
      // Panels saved before the language change have no `language` key.
      language: config.language ?? DEFAULT_LANGUAGE,
      agents: (config.agents ?? []).map((a: Agent) => ({
        ...a,
        // Panels saved before the knowledge feature have no `knowledge` block,
        // and every form reads agent.knowledge.mode unguarded.
        knowledge: a.knowledge ?? emptyKnowledge(),
      })),
      scorer: config.scorer ?? { competencies: [] },
      selectedAgentId: null,
      isSaved: true,
      saveError: null,
      lastSavedAt: Date.now(),
    });
  },

  newPanel: () => set({
    panelId: null, projectName: '', language: DEFAULT_LANGUAGE, agents: [],
    scorer: { competencies: [] }, selectedAgentId: null, isSaved: true,
    saveError: null, lastSavedAt: null,
  }),

  setActiveSpeakerId: (id) => set({ activeSpeakerId: id }),
}));
