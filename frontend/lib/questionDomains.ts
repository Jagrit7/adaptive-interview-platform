export type QuestionDomain =
  | 'dsa'
  | 'system_design'
  | 'behavioural'
  | 'product'
  | 'customer'
  | 'general';

/** Compatibility classifier for questions saved before `domain` existed.
 * New panel JSON stores the returned value explicitly; the backend remains the
 * final authority and performs the same upgrade for old published panels. */
export function inferQuestionDomain(category: string, text: string): QuestionDomain {
  const value = `${category} ${text}`;
  if (/behavio|tell me about|describe a time|communication|leadership|culture|collaboration|conflict|ownership|mistake/i.test(value)) return 'behavioural';
  if (/system design|architecture|scalab|distributed|design (?:a|an|the)|data model|reliability/i.test(value)) return 'system_design';
  if (/coding|dsa|algorithm|data structure|complexity|implement/i.test(value)) return 'dsa';
  if (/product|prioriti[sz]|roadmap|metric|retention/i.test(value)) return 'product';
  if (/customer|client|objection|discovery/i.test(value)) return 'customer';
  return 'general';
}
