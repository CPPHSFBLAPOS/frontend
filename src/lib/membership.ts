import type { DirectoryEntry, EnsureMemberResult, Me, MemberRow } from '../api/types';

// Anyone who signs in with an email code becomes a Cashier. A Super Admin
// sets their first PIN, and turning a member's Active off blocks them.

export const BLOCKED_MESSAGE = 'Your access to the store app was removed. Talk to a Super Admin.';
export const NOT_ALLOWED_MESSAGE = 'Sign in with the code from your email.';

// A sign-up stays unapproved (no permissions) until a Super Admin sets their
// first PIN.
export function isWaitingForApproval(me: Pick<Me, 'approved'> | null): boolean {
  return Boolean(me) && me!.approved === false;
}

export type MembershipProblem = { kind: 'blocked' | 'not_allowed'; message: string };
export type Membership = { me: Me | null; joined: boolean; problem: MembershipProblem | null };

// whoami() first; only when it finds nobody, ensure_member() once. A person
// who is already a member never calls ensure_member, and nothing here loops:
// a refused answer is returned as a problem, not retried.
export async function resolveMembership(api: { whoami: () => Promise<Me | null>; ensureMember: () => Promise<EnsureMemberResult> }): Promise<Membership> {
  const me = await api.whoami();
  if (me) return { me, joined: false, problem: null };
  const r = await api.ensureMember();
  if (r.ok) {
    if (r.me) return { me: r.me, joined: r.joined, problem: null };
    return { me: null, joined: false, problem: { kind: 'not_allowed', message: NOT_ALLOWED_MESSAGE } };
  }
  const blocked = r.error === 'blocked';
  return {
    me: null,
    joined: false,
    problem: { kind: blocked ? 'blocked' : 'not_allowed', message: r.message?.trim() || (blocked ? BLOCKED_MESSAGE : NOT_ALLOWED_MESSAGE) },
  };
}

// What to show when asking for a sign-in code fails. The server's own words
// when it says access was removed; readable text for rate limits, signups
// switched off and no connection; otherwise the real message.
export function signInErrorMessage(err: { message?: string | null; status?: number | null; code?: string | null }): string {
  const message = (err.message ?? '').trim();
  if (/access to the store app was removed/i.test(message)) return message;
  if (err.status === 429 || /rate limit/i.test(message) || /^over_.*rate_limit$/.test(err.code ?? '')) {
    // "For security purposes, you can only request this after 42 seconds."
    if (/after \d+ seconds?/i.test(message)) return message;
    return 'Too many sign-in emails were sent this hour. Wait a while, then try again.';
  }
  // Supabase's own email service (no custom SMTP) only emails the people on
  // the Supabase project's team.
  if (err.code === 'email_address_not_authorized' || /email address .* not authorized/i.test(message)) {
    return 'The store can only email its Supabase team right now. A Super Admin has to finish the email setup.';
  }
  if (/error sending .*email/i.test(message)) {
    return 'The sign-in email could not be sent. A Super Admin should check the email settings in Supabase.';
  }
  if (/signups? (are )?not allowed|signup(s)? (is |are )?disabled/i.test(message) || err.code === 'signup_disabled') {
    return 'New sign-ups are switched off for the store app. Talk to a Super Admin.';
  }
  if (err.status === 0 || /failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return 'No connection to the server. Check the internet, then try again.';
  }
  return message && message !== '{}' ? message : 'That did not work. Try again.';
}

const ROLE_LABELS: Record<string, string> = {
  advisor: 'Advisor',
  president: 'President',
  treasurer: 'Treasurer',
  cashier: 'Cashier',
  register: 'Register account',
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Member';
  return ROLE_LABELS[role] ?? role[0].toUpperCase() + role.slice(1);
}

export function welcomeMessage(me: Pick<Me, 'role'>): string {
  return `Welcome! You are signed up as a ${roleLabel(me.role)}.`;
}

// Someone who could ring sales (a role or Super Admin, not the shared
// Register account) and is still active, but has no PIN yet. New sign-ups
// look like this until a Super Admin sets their first PIN.
export function needsPin(m: Pick<MemberRow, 'active' | 'has_pin' | 'role' | 'is_super_admin'>): boolean {
  return m.active && !m.has_pin && m.role !== 'register' && (m.role !== null || m.is_super_admin);
}

// Members who need a PIN first (newest sign-ups are usually these), the rest
// in the order the server sent them (active first, then by name).
export function membersNeedingPinFirst<T extends Pick<MemberRow, 'active' | 'has_pin' | 'role' | 'is_super_admin'>>(rows: T[]): T[] {
  return [...rows.filter(needsPin), ...rows.filter((m) => !needsPin(m))];
}

export type MemberFilter = 'all' | 'needs_pin' | 'blocked';

export function filterMembers<T extends Pick<MemberRow, 'active' | 'has_pin' | 'role' | 'is_super_admin'>>(rows: T[], filter: MemberFilter): T[] {
  if (filter === 'needs_pin') return rows.filter(needsPin);
  if (filter === 'blocked') return rows.filter((m) => !m.active);
  return rows;
}

// The note on the register's start-a-shift screen for a signed-in person
// with no PIN yet, or null. Their own directory entry is the fresher source;
// whoami's has_pin is the fallback. A Super Admin can set their own first
// PIN; everyone else waits for one.
export function firstPinHint(me: Pick<Me, 'id' | 'role' | 'is_super_admin' | 'has_pin'> | null, directory?: Pick<DirectoryEntry, 'id' | 'has_pin'>[]): string | null {
  if (!me || me.role === 'register') return null;
  if (!me.role && !me.is_super_admin) return null;
  const self = directory?.find((d) => d.id === me.id);
  const hasPin = self ? self.has_pin : me.has_pin;
  if (hasPin) return null;
  return me.is_super_admin
    ? 'Set your own PIN on the Members page before your first shift.'
    : 'Ask a Super Admin to set your PIN on the Members page before your first shift.';
}
