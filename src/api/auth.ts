import { z } from 'zod';
import { signInErrorMessage } from '../lib/membership';
import { hasLinkCode, signInLinkProblem, withoutSignInParams } from '../lib/signInLink';
import { rpc } from './rpc';
import { supabase } from './supabase';
import type { EnsureMemberResult, Me, Permission, Role } from './types';

// Anyone signs in with an emailed one-time code, or with the link in the
// email when the project sends Supabase's own emails (no custom SMTP). The
// database's before-user-created hook turns away only an email that belongs
// to a deactivated (blocked) member; the first sign-in makes everyone else a
// Cashier through ensureMember().
export async function sendCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    // The link comes back to this address. Supabase uses it only when it is
    // in the project's Redirect URLs, and falls back to the Site URL.
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(signInErrorMessage({ message: error.message, status: error.status, code: error.code }));
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
  if (error) {
    if (/expired|invalid/i.test(error.message)) throw new Error('That code is wrong or expired. Ask for a new one.');
    throw new Error(signInErrorMessage({ message: error.message, status: error.status, code: error.code }));
  }
}

// Waits for the Supabase client to read a sign-in link this page was opened
// from, takes the link's leftovers out of the address bar, and says what
// went wrong if it did not sign anyone in. Runs once per page load, so a
// second caller gets the same answer instead of reading the cleaned address.
let linkProblem: Promise<string | null> | null = null;
export function takeSignInLinkProblem(): Promise<string | null> {
  linkProblem ??= supabase.auth.initialize().then(({ error }) => {
    const href = window.location.href;
    const problem = signInLinkProblem({ error, leftoverCode: hasLinkCode(href) });
    const clean = withoutSignInParams(href);
    if (clean !== href) window.history.replaceState(window.history.state, '', clean);
    return problem;
  });
  return linkProblem;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export function whoami(): Promise<Me | null> {
  return rpc<Me | null>('whoami');
}

// The same object whoami() returns. Roles and permissions are kept as text
// so a new one on the server does not break sign-in.
const meSchema = z.looseObject({
  id: z.string(),
  email: z.string(),
  display_name: z.string(),
  grade: z.number().nullable(),
  role: z.string().nullable(),
  is_super_admin: z.boolean(),
  active: z.boolean(),
  has_pin: z.boolean(),
  linked: z.boolean(),
  approved: z.boolean().optional(),
  permissions: z.array(z.string()),
});

const ensureMemberSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), joined: z.boolean(), me: meSchema.nullable() }),
  z.object({ ok: z.literal(false), error: z.string(), message: z.string() }),
]);

// Makes the signed-in person a member (role Cashier) the first time they
// sign in; safe to call again. Answers blocked/not_allowed instead of raising.
export async function ensureMember(): Promise<EnsureMemberResult> {
  const r = ensureMemberSchema.parse(await rpc<unknown>('ensure_member'));
  if (!r.ok) return r;
  const me = r.me ? ({ ...r.me, role: r.me.role as Role | null, permissions: r.me.permissions as Permission[] } as Me) : null;
  return { ok: true, joined: r.joined, me };
}

export function recordSignIn(): Promise<void> {
  return rpc<void>('record_sign_in');
}
