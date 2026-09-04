import type { PanelConfig } from '@/lib/panels';

/** The first immutable individual interview preset. */
export const DSA_INTERVIEW_PRESET: PanelConfig = {
  projectName: 'DSA Foundations Interview',
  language: 'en-US',
  agents: [{
    id: 'dsa-foundations-interviewer',
    identity: { name: 'Ari', role: 'Technical', color: 'var(--color-practice-accent)', avatar: 'AR' },
    behavior: {
      systemPrompt: [
        'You are Ari, a supportive but rigorous data structures and algorithms interviewer.',
        'Begin with a friendly conversation: greet the candidate, ask their name, and ask a small number of background questions.',
        'When the application reveals the coding question, do not read it aloud. Say only that the question is on screen, state the time limit, and wish the candidate luck.',
        'Remain silent while the candidate codes. Resume only when the application reports submission or time expiry.',
        'Then ask exactly one verbal follow-up about the candidate\'s code, complexity, trade-offs, or a missed edge case.',
        'Do not reveal an ideal answer before the candidate has committed to an answer.',
        'Keep the interview focused on foundations and finish with concise, actionable feedback.',
      ].join(' '),
      greetingMessage: 'Welcome. I am Ari, your DSA interviewer. Before we begin, I would like to learn a little about you.',
      fallbackMessage: 'Take a moment and start with the data structure or operation the question is testing.',
      scenarioBrief: 'One selected timed DSA challenge followed by one verbal question grounded in the submitted code.',
    },
    logic: {
      difficultyBand: [1, 2], seedQuestions: [], followUpAggressiveness: 2,
      maxTurns: 2, maxVisits: 1,
      questionKinds: ['coding', 'verbal'], maxRetriesPerQuestion: 1, vagueProbing: true, satisfactionThreshold: 0.8,
    },
    knowledge: {
      mode: 'knowledge_base', strict: true, sourceName: 'DSA foundations v1',
      items: [{
        id: 'dsa-two-sum-01',
        question: 'Solve Two Sum: return the indices of two distinct values in an integer array that add up to the target.',
        idealAnswer: 'Use a hash map from previously seen value to index. For each value, look up target minus value before inserting the current value. This returns the valid pair in O(n) time and O(n) space without reusing the same element.',
        tags: ['arrays', 'hashing', 'complexity'],
        difficulty: 1,
      }],
    },
    skills: { rolePlayMode: false, loopUntilSatisfied: true, contradictionProbing: false },
    tools: [],
    turnTaking: { canOpen: true, handoffTriggers: '', priority: 'high' },
    scoring: { competencies: ['DSA fundamentals', 'Complexity analysis', 'Reasoning clarity'] },
  }],
  scorer: { competencies: [
    { name: 'DSA fundamentals', weight: 45, threshold: 60 },
    { name: 'Complexity analysis', weight: 30, threshold: 55 },
    { name: 'Reasoning clarity', weight: 25, threshold: 55 },
  ] },
};
