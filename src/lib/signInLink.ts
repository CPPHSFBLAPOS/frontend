// Sign-in links. Supabase's own emails (used when the project has no custom
// SMTP) carry a link instead of a code. The link comes back to the app as
// ?code=... (PKCE), which the Supabase client trades for a session only in
// the browser that asked for the email. A link that fails comes back with
// error=...&error_code=...&error_description=... in the query or the hash.

const LINK_PARAMS = ['code', 'sb_flow_id', 'error', 'error_code', 'error_description'];
const LINK_HASH_KEYS = ['access_token', 'refresh_token', 'error', 'error_code', 'error_description'];

export const LINK_EXPIRED_MESSAGE = 'That sign-in link expired or was already used. Ask for a new email.';
export const LINK_OTHER_BROWSER_MESSAGE =
  'That sign-in link opened in a different browser. Open it in the browser where you asked for it, or type the code if the email has one.';
export const LINK_FAILED_MESSAGE = 'That sign-in link did not work. Ask for a new email.';

export function hasLinkCode(href: string): boolean {
  return new URL(href).searchParams.has('code');
}

// What to tell someone whose sign-in link did not sign them in. `error` is
// what the Supabase client reported while reading the link; `leftoverCode`
// means a ?code= is still in the address, which happens when this browser
// has no record of asking for it.
export function signInLinkProblem(input: {
  error: { message?: string; code?: string; details?: { code?: string } | null } | null;
  leftoverCode: boolean;
}): string | null {
  const { error } = input;
  if (error) {
    const code = error.details?.code ?? error.code ?? '';
    if (code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found') return LINK_EXPIRED_MESSAGE;
    if (/expired|invalid/i.test(error.message ?? '')) return LINK_EXPIRED_MESSAGE;
    return LINK_FAILED_MESSAGE;
  }
  return input.leftoverCode ? LINK_OTHER_BROWSER_MESSAGE : null;
}

// The address without a sign-in link's leftovers, or the same string when
// there are none.
export function withoutSignInParams(href: string): string {
  const url = new URL(href);
  let changed = false;
  for (const key of LINK_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  if (LINK_HASH_KEYS.some((key) => hash.has(key))) {
    url.hash = '';
    changed = true;
  }
  return changed ? url.toString() : href;
}
