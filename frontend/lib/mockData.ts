/** All practice-side mock data in one file, so swapping it for an API later is
 *  a single import change. Numbers and names come from the design photos. */

export const USER = {
  name: 'Alex Johnson',
  track: 'Senior Software Engineer Track',
  level: 12,
  xp: 2450,
  streak: 14,
  gems: 120,
  globalRank: 428,
  xpToNextRank: 3000,
};

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Interview {
  id: string;
  title: string;
  blurb: string;
  skill: string;
  role: string;
  language: string;
  difficulty: Difficulty;
  minutes: number;
  xp: number;
  taken: number;
}

export const INTERVIEWS: Interview[] = [
  { id: 'arrays-hashing', title: 'Arrays & Hashing 101',
    blurb: 'Master the fundamentals of array manipulation and basic hash maps.',
    skill: 'Technical', role: 'Software Engineer', language: 'Python',
    difficulty: 'Easy', minutes: 30, xp: 150, taken: 89204 },
  { id: 'star-basics', title: 'STAR Method Basics',
    blurb: 'Learn to structure your behavioural answers so they actually land.',
    skill: 'Behavioural', role: 'Software Engineer', language: 'None',
    difficulty: 'Easy', minutes: 20, xp: 100, taken: 44310 },
  { id: 'url-shortener', title: 'URL Shortener Design',
    blurb: 'Design a scalable URL shortening service like bit.ly.',
    skill: 'System Design', role: 'Senior Software Engineer', language: 'None',
    difficulty: 'Medium', minutes: 45, xp: 350, taken: 12480 },
  { id: 'dp-advanced', title: 'Dynamic Programming Advanced',
    blurb: 'Tackle complex 2D DP problems involving state compression.',
    skill: 'Technical', role: 'Senior Software Engineer', language: 'Python',
    difficulty: 'Hard', minutes: 60, xp: 500, taken: 6145 },
  { id: 'debounced-search', title: 'Build a debounced search box',
    blurb: 'Handle race conditions, cancellation and keyboard access.',
    skill: 'Frontend', role: 'Software Engineer', language: 'TypeScript',
    difficulty: 'Medium', minutes: 25, xp: 150, taken: 31067 },
  { id: 'gradient-descent', title: 'Explain gradient descent',
    blurb: 'Talk through the intuition, the maths, and where it fails.',
    skill: 'Machine Learning', role: 'ML Engineer', language: 'Python',
    difficulty: 'Medium', minutes: 20, xp: 140, taken: 8932 },
  { id: 'rate-limiter', title: 'Rate limiter at 100k rps',
    blurb: 'Token bucket, sliding window, and the distributed state problem.',
    skill: 'Backend', role: 'Senior Software Engineer', language: 'Go',
    difficulty: 'Hard', minutes: 30, xp: 260, taken: 6145 },
  { id: 'sql-joins', title: 'SQL joins and query plans',
    blurb: 'Read an EXPLAIN output and say why the planner chose that path.',
    skill: 'Backend', role: 'Data Analyst', language: 'SQL',
    difficulty: 'Medium', minutes: 25, xp: 180, taken: 21774 },
];

export const SKILLS = ['Technical', 'Behavioural', 'System Design', 'Frontend', 'Backend', 'Machine Learning'];
export const ROLES = ['Software Engineer', 'Senior Software Engineer', 'ML Engineer', 'Data Analyst'];
export const LANGS = ['Python', 'TypeScript', 'Go', 'SQL', 'None'];

export const RANKINGS = [
  { rank: 426, name: 'Michael Chang',   track: 'Data Science Track',  streak: 5,  xp: 3120, you: false },
  { rank: 427, name: 'Alex Johnson',    track: 'Senior SWE Track',    streak: 14, xp: 2450, you: true  },
  { rank: 428, name: 'Samantha Jones',  track: 'Frontend Track',      streak: 2,  xp: 2410, you: false },
  { rank: 429, name: 'Priya Nair',      track: 'Backend Track',       streak: 9,  xp: 2380, you: false },
  { rank: 430, name: 'Tom Okafor',      track: 'ML Track',            streak: 3,  xp: 2295, you: false },
];

export const PODIUM = [
  { place: 2, name: 'Sarah M.', xp: 5820 },
  { place: 1, name: 'David K.', xp: 6410 },
  { place: 3, name: 'Emily R.', xp: 5240 },
];

export const RESULT = {
  score: 85,
  xp: 350,
  gems: 25,
  breakdown: [
    { name: 'Communication',  value: 90, tone: 'pass' as const },
    { name: 'Technical',      value: 75, tone: 'warn' as const },
    { name: 'Problem Solving', value: 88, tone: 'accent' as const },
  ],
  strengths: [
    'Excellent articulation of past project challenges using the STAR method.',
    'Strong active listening; addressed multi-part questions thoroughly.',
  ],
  growth: [
    'Deepen explanations of system architecture tradeoffs, for example SQL versus NoSQL.',
    'Pause and structure thoughts briefly before diving into complex algorithms.',
  ],
  path: [
    { label: 'Basics',        state: 'done'    as const },
    { label: 'Mock Int 1',    state: 'current' as const },
    { label: 'System Design', state: 'locked'  as const },
    { label: 'Final Boss',    state: 'locked'  as const },
  ],
};

/* ---------------- enterprise console ---------------- */

export const CONFIGS = [
  { id: 'c1', name: 'Senior Frontend Engineer — Q3', role: 'Engineering', status: 'active' as const, modified: 'Oct 24, 2026', interviewers: 4, language: 'en-US' },
  { id: 'c2', name: 'Product Manager Case Study',    role: 'Product',     status: 'draft'  as const, modified: 'Oct 22, 2026', interviewers: 3, language: 'en-US' },
  { id: 'c3', name: 'Backend Systems Architecture',  role: 'Engineering', status: 'done'   as const, modified: 'Sep 15, 2026', interviewers: 4, language: 'en-US' },
  { id: 'c4', name: 'ML Engineer — Screening',       role: 'Engineering', status: 'active' as const, modified: 'Oct 19, 2026', interviewers: 2, language: 'en-IN' },
];

export const CANDIDATES = [
  { id: 'p1', name: 'Sarah Jenkins',   email: 's.jenkins@example.com', role: 'Senior Frontend Engineer', status: 'Technical round' as const, score: 92 },
  { id: 'p2', name: 'Marcus Rodriguez', email: 'marcus.r@example.com', role: 'Backend Developer',        status: 'Screening'      as const, score: null },
  { id: 'p3', name: 'David Chen',      email: 'd.chen@example.com',    role: 'Senior Frontend Engineer', status: 'Completed'      as const, score: 96 },
  { id: 'p4', name: 'Priya Nair',      email: 'p.nair@example.com',    role: 'ML Engineer',              status: 'Completed'      as const, score: 78 },
  { id: 'p5', name: 'Tom Okafor',      email: 't.okafor@example.com',  role: 'Backend Developer',        status: 'Screening'      as const, score: null },
];

export const EVALUATION = {
  name: 'Alex Johnson',
  role: 'Senior Frontend Engineer',
  verdict: 'Strong match',
  experience: '8 yrs experience',
  overall: 92,
  bars: [
    { label: 'Technical',     value: 90 },
    { label: 'Behavioural',   value: 95 },
    { label: 'Communication', value: 88 },
  ],
  summary: [
    'Alex showed strong command of modern frontend architecture, particularly state management and component lifecycle. In the technical round they articulated complex ideas clearly and proposed a scalable approach to the scenario given.',
    'Beyond the technical, Alex described several instances of mentoring and cross-functional work. Their problem-solving is methodical and evidence-led. The panel recommends progressing to a final round.',
  ],
  strengths: [
    'Deep understanding of React concurrent mode and suspense.',
    'Strong system design intuition for high-traffic web applications.',
    'Clear, concise explanations of trade-offs.',
  ],
  growth: [
    'Limited exposure to container orchestration.',
    'Tends to over-engineer before clarifying the minimum requirement.',
  ],
  skills: [
    { label: 'Technical',     value: 0.92 },
    { label: 'Communication', value: 0.88 },
    { label: 'Behavioural',   value: 0.95 },
  ],
};

/* ---------------- skill paths & profile ---------------- */

export const SKILL_PATHS = [
  { id: 'dsa', name: 'Data Structures & Algorithms', level: 1, done: 0, total: 5,
    featured: true, next: 'Arrays and complexity', availability: 'available' as const },
  { id: 'frontend', name: 'Frontend Engineering', level: 0, done: 0, total: 30,
    availability: 'coming_soon' as const, locked: 'Coming soon' },
  { id: 'backend', name: 'Backend Engineering', level: 0, done: 0, total: 20,
    availability: 'coming_soon' as const, locked: 'Coming soon' },
  { id: 'sysdesign', name: 'System Design', level: 0, done: 0, total: 10,
    availability: 'coming_soon' as const, locked: 'Coming soon' },
  { id: 'databases', name: 'Databases and SQL', level: 0, done: 0, total: 30,
    availability: 'coming_soon' as const, locked: 'Coming soon' },
  { id: 'comms', name: 'Communication', level: 0, done: 0, total: 20,
    availability: 'coming_soon' as const, locked: 'Coming soon' },
  { id: 'behaviour', name: 'Behavioural', level: 0, done: 0, total: 20,
    availability: 'coming_soon' as const, locked: 'Coming soon' },
  { id: 'ml', name: 'AI and Machine Learning', level: 0, done: 0, total: 24,
    availability: 'coming_soon' as const, locked: 'Coming soon' },
];

export const PROFILE = {
  name: 'Alex Johnson',
  title: 'Frontend Aspirant',
  goal: 'Junior Frontend Engineer',
  level: 12,
  totalXp: 15400,
  toNextLevel: 75,
  streak: 12,
  gems: 45,
  trophies: 3,
  readiness: 82,
  readyLabel: 'Interview ready',
  earned: [
    { name: 'First round',  hint: 'Finish your first interview' },
    { name: 'Week warrior', hint: 'A 7-day streak' },
    { name: 'System thinker', hint: 'Pass a system design round' },
  ],
  locked: [
    { name: 'Polyglot', hint: 'Pass an interview in 3 languages' },
    { name: 'Flawless', hint: 'Score above 90% on a Hard interview' },
    { name: 'Marathon', hint: 'A 30-day streak' },
  ],
};

/* ---------------- practice categories ---------------- */

export interface Category {
  slug: string;
  name: string;
  eyebrow: string;
  blurb: string;
  featured: { tag: string; title: string; blurb: string; peers: number };
  daily: { tag: string; title: string; blurb: string; cta: string };
  explore: { label: string; count: number }[];
}

export const CATEGORIES: Record<string, Category> = {
  technical: {
    slug: 'technical', name: 'Technical Interview', eyebrow: 'PRACTICE ARENA',
    blurb: 'Sharpen your coding with role-specific challenges, algorithmic puzzles and real debugging scenarios built to feel like an actual technical round.',
    featured: { tag: 'Trending', title: 'Blind 75 Essentials',
      blurb: 'The definitive collection of the most frequent data structures and algorithms questions asked at large tech companies.', peers: 73 },
    daily: { tag: 'Daily byte', title: 'React performance tips',
      blurb: 'Memoization and render optimisation, in five minutes.', cta: 'Start quick quiz' },
    explore: [
      { label: 'Frontend', count: 142 }, { label: 'Backend', count: 156 },
      { label: 'Fullstack', count: 89 }, { label: 'Mobile', count: 64 },
      { label: 'DevOps', count: 45 },
    ],
  },
  behavioural: {
    slug: 'behavioural', name: 'Behavioural Interview', eyebrow: 'PRACTICE ARENA',
    blurb: 'Practise telling your own stories well. Structure, specificity, and knowing what the interviewer is actually listening for.',
    featured: { tag: 'Most practised', title: 'The STAR method, properly',
      blurb: 'Situation, task, action, result — and the part everyone skips, which is what you would do differently.', peers: 128 },
    daily: { tag: 'Daily byte', title: 'Answering "tell me about yourself"',
      blurb: 'Ninety seconds, three beats, no life story.', cta: 'Start quick quiz' },
    explore: [
      { label: 'Conflict', count: 48 }, { label: 'Failure', count: 36 },
      { label: 'Leadership', count: 52 }, { label: 'Ownership', count: 41 },
      { label: 'Ambiguity', count: 29 },
    ],
  },
  'case-study': {
    slug: 'case-study', name: 'Case Study Interview', eyebrow: 'PRACTICE ARENA',
    blurb: 'Work through open-ended business and product problems out loud, structuring as you go rather than arriving with an answer.',
    featured: { tag: 'Trending', title: 'Product sense: pick a metric',
      blurb: 'Given a product and a goal, choose the one number you would move and defend why it beats the obvious alternatives.', peers: 54 },
    daily: { tag: 'Daily byte', title: 'Estimation without panic',
      blurb: 'Break the number down, state assumptions, sanity check.', cta: 'Start quick quiz' },
    explore: [
      { label: 'Product sense', count: 62 }, { label: 'Metrics', count: 44 },
      { label: 'Estimation', count: 38 }, { label: 'Strategy', count: 31 },
      { label: 'Prioritisation', count: 27 },
    ],
  },
  'system-design': {
    slug: 'system-design', name: 'System Design Interview', eyebrow: 'PRACTICE ARENA',
    blurb: 'Design systems under pressure. Scale, trade-offs, and the discipline of saying what you would not build.',
    featured: { tag: 'Trending', title: 'Distributed architecture',
      blurb: 'Sharding, replication, consistency models, and where each one stops being worth its cost.', peers: 91 },
    daily: { tag: 'Daily byte', title: 'CAP in one minute',
      blurb: 'What it actually constrains, and what it does not.', cta: 'Start quick quiz' },
    explore: [
      { label: 'Scalability', count: 58 }, { label: 'Databases', count: 47 },
      { label: 'Caching', count: 33 }, { label: 'Messaging', count: 29 },
      { label: 'Reliability', count: 25 },
    ],
  },
  'hr-round': {
    slug: 'hr-round', name: 'HR Round', eyebrow: 'PRACTICE ARENA',
    blurb: 'The conversation that decides fit, motivation and expectations. Short, and easier to fumble than people expect.',
    featured: { tag: 'Most practised', title: 'Salary and expectations',
      blurb: 'Answering the number question without anchoring yourself low or dodging it into awkwardness.', peers: 66 },
    daily: { tag: 'Daily byte', title: 'Why are you leaving?',
      blurb: 'Honest, forward-looking, and not about your last manager.', cta: 'Start quick quiz' },
    explore: [
      { label: 'Motivation', count: 34 }, { label: 'Expectations', count: 28 },
      { label: 'Culture fit', count: 40 }, { label: 'Notice period', count: 18 },
      { label: 'Questions to ask', count: 22 },
    ],
  },
};

export const ANALYTICS = {
  score: 78,
  delta: 5,
  trending: 'Strong hire',
  towards: 'Backend Engineering',
  focus: 'System Design',
  domains: [
    { label: 'Technical (algorithms)', value: 85, tone: 'accent' as const },
    { label: 'System design',          value: 60, tone: 'warn'   as const },
    { label: 'Behavioural and comms',  value: 92, tone: 'pass'   as const },
  ],
  radar: [
    { label: 'Technical', value: 0.85 }, { label: 'Communication', value: 0.92 },
    { label: 'Leadership', value: 0.7 }, { label: 'Problem solving', value: 0.8 },
    { label: 'System design', value: 0.6 },
  ],
  recommended: [
    { title: 'Database sharding strategies', blurb: 'Horizontal scaling, specifically where it stops helping.', minutes: 45 },
    { title: 'Microservices vs monolith', blurb: 'Trade-offs. Your weakest area on recent rounds.', minutes: 75 },
    { title: 'Advanced caching', blurb: 'Complete the previous modules to unlock.', minutes: 0, locked: true },
  ],
};

export const CONFIGURATION = {
  module: 'Module 4 unlocked',
  title: 'System Design: Distributed Architecture',
  blurb: 'Configure your mock interview. This session tests whether you can design scalable, available systems while being questioned about them.',
  minutes: 45,
  difficulty: 'Advanced',
  focus: [
    { title: 'Scalability patterns', blurb: 'Horizontal versus vertical scaling, and caching.' },
    { title: 'High availability',    blurb: 'Redundancy, failover and SLA targets.' },
    { title: 'Data storage',         blurb: 'SQL versus NoSQL, sharding and replication.' },
    { title: 'Trade-offs',           blurb: 'CAP in practice, and consistency models.' },
  ],
  vibes: ['Supportive and guiding', 'Balanced', 'Strict and challenging'],
};

export const NOTIFICATIONS = [
  { id: 'n1', kind: 'trophy' as const, title: 'Trophy unlocked: Week Warrior', body: 'Seven days in a row. Keep going.', when: '2 hours ago', unread: true },
  { id: 'n2', kind: 'result' as const, title: 'Your System Design report is ready', body: 'You scored 85. Communication was your strongest area.', when: 'Yesterday', unread: true },
  { id: 'n3', kind: 'league' as const, title: 'You moved up to #427', body: 'Two more places and you are in the promotion zone.', when: 'Yesterday', unread: false },
  { id: 'n4', kind: 'streak' as const, title: 'Streak reminder', body: 'Finish one round today to keep your 12-day streak.', when: '2 days ago', unread: false },
  { id: 'n5', kind: 'result' as const, title: 'Your Behavioural report is ready', body: 'You scored 74. Growth area: structuring answers before you start.', when: '4 days ago', unread: false },
];
