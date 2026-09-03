export type AccountRole = 'individual' | 'enterprise';

export const ROLE_HOME: Record<AccountRole, string> = {
  individual: '/practice',
  enterprise: '/enterprise',
};

export function parseAccountRole(value: string | null | undefined): AccountRole {
  return value === 'enterprise' ? 'enterprise' : 'individual';
}

export function safePostAuthPath(
  value: string | null | undefined,
  role: AccountRole,
): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return ROLE_HOME[role];
  }

  const allowedRoots = role === 'individual'
    ? ['/practice', '/skills', '/leaderboard', '/profile', '/analytics', '/settings', '/notifications']
    : ['/enterprise', '/panels', '/builder', '/reports'];

  return allowedRoots.some((root) => value === root || value.startsWith(`${root}/`))
    ? value
    : ROLE_HOME[role];
}

export function loginHref(role: AccountRole, next?: string): string {
  const params = new URLSearchParams({ role });
  if (next) params.set('next', next);
  return `/login?${params.toString()}`;
}
