import { describe, expect, it, vi } from 'vitest';
import type { EnsureMemberResult, Me } from '../api/types';
import {
  isWaitingForApproval,
  BLOCKED_MESSAGE,
  NOT_ALLOWED_MESSAGE,
  filterMembers,
  firstPinHint,
  membersNeedingPinFirst,
  needsPin,
  resolveMembership,
  roleLabel,
  signInErrorMessage,
  welcomeMessage,
} from './membership';

const me: Me = {
  id: 'm1',
  email: 'kid@example.com',
  display_name: 'kid',
  grade: null,
  role: 'cashier',
  is_super_admin: false,
  active: true,
  has_pin: false,
  linked: true,
  permissions: ['ring_sales', 'sell_gift_cards'],
};

describe('resolveMembership', () => {
  it('uses whoami and never calls ensure_member for an existing member', async () => {
    const ensureMember = vi.fn<() => Promise<EnsureMemberResult>>();
    const r = await resolveMembership({ whoami: async () => me, ensureMember });
    expect(r).toEqual({ me, joined: false, problem: null });
    expect(ensureMember).not.toHaveBeenCalled();
  });

  it('calls ensure_member once for a new person and reports joined', async () => {
    const ensureMember = vi.fn(async (): Promise<EnsureMemberResult> => ({ ok: true, joined: true, me }));
    const r = await resolveMembership({ whoami: async () => null, ensureMember });
    expect(r).toEqual({ me, joined: true, problem: null });
    expect(ensureMember).toHaveBeenCalledTimes(1);
  });

  it('keeps blocked apart from other refusals, with the server message', async () => {
    const blocked = await resolveMembership({
      whoami: async () => null,
      ensureMember: async () => ({ ok: false, error: 'blocked', message: BLOCKED_MESSAGE }),
    });
    expect(blocked).toEqual({ me: null, joined: false, problem: { kind: 'blocked', message: BLOCKED_MESSAGE } });

    const other = await resolveMembership({
      whoami: async () => null,
      ensureMember: async () => ({ ok: false, error: 'not_allowed', message: 'This email is tied to another sign-in. Talk to a Super Admin.' }),
    });
    expect(other.problem).toEqual({ kind: 'not_allowed', message: 'This email is tied to another sign-in. Talk to a Super Admin.' });
  });

  it('falls back to its own words when the server sends none, and treats ok without me as not a member', async () => {
    const blank = await resolveMembership({ whoami: async () => null, ensureMember: async () => ({ ok: false, error: 'blocked', message: ' ' }) });
    expect(blank.problem).toEqual({ kind: 'blocked', message: BLOCKED_MESSAGE });
    const unknown = await resolveMembership({ whoami: async () => null, ensureMember: async () => ({ ok: false, error: 'something_new', message: '' }) });
    expect(unknown.problem).toEqual({ kind: 'not_allowed', message: NOT_ALLOWED_MESSAGE });
    const empty = await resolveMembership({ whoami: async () => null, ensureMember: async () => ({ ok: true, joined: false, me: null }) });
    expect(empty).toEqual({ me: null, joined: false, problem: { kind: 'not_allowed', message: NOT_ALLOWED_MESSAGE } });
  });

  it('lets a failed call throw so the query can retry instead of deciding the person is not a member', async () => {
    await expect(resolveMembership({ whoami: async () => null, ensureMember: async () => Promise.reject(new Error('offline')) })).rejects.toThrow('offline');
  });
});

describe('signInErrorMessage', () => {
  it('shows the server’s words when access was removed, whatever the status', () => {
    expect(signInErrorMessage({ message: BLOCKED_MESSAGE, status: 403 })).toBe(BLOCKED_MESSAGE);
    expect(signInErrorMessage({ message: BLOCKED_MESSAGE, status: 422 })).toBe(BLOCKED_MESSAGE);
  });

  it('no longer tells people to ask the Advisor to add them', () => {
    expect(signInErrorMessage({ message: 'Error running hook URI: pg-functions://postgres/public/hook_before_user_created', status: 500 })).toBe(
      'Error running hook URI: pg-functions://postgres/public/hook_before_user_created',
    );
    expect(signInErrorMessage({ message: 'Something else', status: 403 })).toBe('Something else');
  });

  it('keeps rate limits readable', () => {
    expect(signInErrorMessage({ message: 'For security purposes, you can only request this after 42 seconds.', status: 429, code: 'over_request_rate_limit' })).toBe(
      'For security purposes, you can only request this after 42 seconds.',
    );
    expect(signInErrorMessage({ message: 'Email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' })).toBe(
      'Too many sign-in emails were sent this hour. Wait a while, then try again.',
    );
  });

  it('explains email setup problems instead of a server error', () => {
    expect(
      signInErrorMessage({ message: 'Email address "kid@cppasd.com" cannot be used as it is not authorized', status: 400, code: 'email_address_not_authorized' }),
    ).toBe('The store can only email its Supabase team right now. A Super Admin has to finish the email setup.');
    expect(signInErrorMessage({ message: 'Error sending confirmation email', status: 500, code: 'unexpected_failure' })).toBe(
      'The sign-in email could not be sent. A Super Admin should check the email settings in Supabase.',
    );
    expect(signInErrorMessage({ message: 'Error sending magic link email', status: 500 })).toBe(
      'The sign-in email could not be sent. A Super Admin should check the email settings in Supabase.',
    );
  });

  it('explains switched-off sign-ups and a missing connection', () => {
    expect(signInErrorMessage({ message: 'Signups not allowed for otp', status: 422, code: 'otp_disabled' })).toBe(
      'New sign-ups are switched off for the store app. Talk to a Super Admin.',
    );
    expect(signInErrorMessage({ message: 'Failed to fetch', status: 0 })).toBe('No connection to the server. Check the internet, then try again.');
    expect(signInErrorMessage({ message: '{}', status: 500 })).toBe('That did not work. Try again.');
  });
});

describe('members and PINs', () => {
  const row = (over: Partial<Me>) => ({ ...me, ...over });

  it('needs a PIN only for active people who could ring sales', () => {
    expect(needsPin(row({}))).toBe(true);
    expect(needsPin(row({ has_pin: true }))).toBe(false);
    expect(needsPin(row({ active: false }))).toBe(false);
    expect(needsPin(row({ role: 'register' }))).toBe(false);
    expect(needsPin(row({ role: null }))).toBe(false);
    expect(needsPin(row({ role: null, is_super_admin: true }))).toBe(true);
  });

  it('puts people needing a PIN first and keeps the rest in server order', () => {
    const rows = [row({ id: 'a', has_pin: true }), row({ id: 'b' }), row({ id: 'c', active: false }), row({ id: 'd' })];
    expect(membersNeedingPinFirst(rows).map((r) => r.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(filterMembers(rows, 'needs_pin').map((r) => r.id)).toEqual(['b', 'd']);
    expect(filterMembers(rows, 'blocked').map((r) => r.id)).toEqual(['c']);
    expect(filterMembers(rows, 'all')).toHaveLength(4);
  });

  it('tells a new cashier who sets their first PIN', () => {
    expect(firstPinHint(me)).toBe('Ask a Super Admin to set your PIN on the Members page before your first shift.');
    // Their own directory entry wins over a stale whoami.
    expect(firstPinHint(me, [{ id: 'm1', has_pin: true }])).toBeNull();
    expect(firstPinHint({ ...me, has_pin: true }, [{ id: 'm1', has_pin: false }])).not.toBeNull();
    expect(firstPinHint({ ...me, has_pin: true })).toBeNull();
    expect(firstPinHint({ ...me, role: 'register' })).toBeNull();
    expect(firstPinHint({ ...me, role: null })).toBeNull();
    expect(firstPinHint({ ...me, role: null, is_super_admin: true })).toBe('Set your own PIN on the Members page before your first shift.');
    expect(firstPinHint(null)).toBeNull();
  });

  it('names roles for people', () => {
    expect(welcomeMessage({ role: 'cashier' })).toBe('Welcome! You are signed up as a Cashier.');
    expect(roleLabel('register')).toBe('Register account');
    expect(roleLabel(null)).toBe('Member');
  });
});

describe('isWaitingForApproval', () => {
  it('is true only when the server says approved: false', () => {
    expect(isWaitingForApproval(null)).toBe(false);
    expect(isWaitingForApproval({ approved: false })).toBe(true);
    expect(isWaitingForApproval({ approved: true })).toBe(false);
    // An older server that does not send the flag counts as approved.
    expect(isWaitingForApproval({})).toBe(false);
  });
});
