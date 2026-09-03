export type SkillModuleState = 'available' | 'coming_soon';

export interface SkillModule {
  id: string;
  order: number;
  title: string;
  description: string;
  topics: string[];
  estimatedMinutes: number;
  state: SkillModuleState;
}

export const DSA_SKILL_PATH = {
  slug: 'dsa',
  eyebrow: 'DSA FOUNDATIONS',
  title: 'Data Structures & Algorithms',
  description: 'Build the reasoning habits that technical interviews test: choose the right structure, explain the trade-off, and state the cost clearly.',
  level: 'Foundation',
  modules: [
    { id: 'arrays-complexity', order: 1, title: 'Arrays and complexity', description: 'Index access, contiguous storage, Big O, and how to explain runtime without hand-waving.', topics: ['Arrays', 'Big O', 'Complexity'], estimatedMinutes: 25, state: 'available' },
    { id: 'stacks-queues', order: 2, title: 'Stacks and queues', description: 'LIFO, FIFO, core operations, and choosing the correct ordering model.', topics: ['Stacks', 'Queues'], estimatedMinutes: 20, state: 'available' },
    { id: 'binary-search', order: 3, title: 'Binary search', description: 'Halving the search space, prerequisites, and logarithmic complexity.', topics: ['Searching', 'O(log n)'], estimatedMinutes: 20, state: 'available' },
    { id: 'hashing-linked-lists', order: 4, title: 'Hashing and linked lists', description: 'The next foundation block will add collision trade-offs and pointer-based structures.', topics: ['Hash maps', 'Linked lists'], estimatedMinutes: 35, state: 'coming_soon' },
    { id: 'trees-graphs', order: 5, title: 'Trees and graphs', description: 'The advanced foundation block will cover traversal and graph representation.', topics: ['Trees', 'Graphs', 'Traversal'], estimatedMinutes: 45, state: 'coming_soon' },
  ] satisfies SkillModule[],
};

