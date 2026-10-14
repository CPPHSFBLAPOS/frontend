import { rpc } from './rpc';
import { supabase } from './supabase';
import type { Me } from './types';

// Members sign in with a one-time code emailed to their school address.
// Only listed members can get a code: the database's before-user-created
// hook turns everyone else away.
export async function sendCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) {
    if (/advisor|not allowed|signups|hook|403|422/i.test(`${error.message} ${error.status}`)) {
      throw new Error('Ask the Advisor to add you.');
    }
    throw new Error(error.message);
  }
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code is wrong or expired. Ask for a new one.' : error.message);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export function whoami(): Promise<Me | null> {
  return rpc<Me | null>('whoami');
}

export function recordSignIn(): Promise<void> {
  return rpc<void>('record_sign_in');
}
