import { describe, expect, it } from 'vitest';
import {
  LINK_EXPIRED_MESSAGE,
  LINK_FAILED_MESSAGE,
  LINK_OTHER_BROWSER_MESSAGE,
  hasLinkCode,
  signInLinkProblem,
  withoutSignInParams,
} from './signInLink';

describe('signInLinkProblem', () => {
  it('says nothing when the page was not opened from a link, or the link signed in', () => {
    expect(signInLinkProblem({ error: null, leftoverCode: false })).toBeNull();
  });

  it('calls an expired or used link expired', () => {
    // Supabase's redirect after a used link: #error=access_denied&error_code=otp_expired
    expect(
      signInLinkProblem({ error: { message: 'Email link is invalid or has expired', details: { code: 'otp_expired' } }, leftoverCode: false }),
    ).toBe(LINK_EXPIRED_MESSAGE);
    expect(signInLinkProblem({ error: { message: 'invalid flow state, no valid flow state found', code: 'flow_state_not_found' }, leftoverCode: true })).toBe(
      LINK_EXPIRED_MESSAGE,
    );
  });

  it('sends a link opened in another browser back to the browser that asked for it', () => {
    expect(signInLinkProblem({ error: null, leftoverCode: true })).toBe(LINK_OTHER_BROWSER_MESSAGE);
  });

  it('turns away a link with tokens in it, which only a forged link would have', () => {
    expect(signInLinkProblem({ error: { message: 'Not a valid PKCE flow url.' }, leftoverCode: false })).toBe(LINK_FAILED_MESSAGE);
  });
});

describe('withoutSignInParams', () => {
  it('drops a link’s code and error, keeping the rest of the address', () => {
    expect(withoutSignInParams('https://store.example/register?tab=outage&code=abc&sb_flow_id=f1')).toBe('https://store.example/register?tab=outage');
    expect(withoutSignInParams('https://store.example/?error=access_denied&error_code=otp_expired&error_description=Expired')).toBe(
      'https://store.example/',
    );
  });

  it('drops a hash that carries tokens or an error', () => {
    expect(withoutSignInParams('https://store.example/#error=access_denied&error_code=otp_expired')).toBe('https://store.example/');
    expect(withoutSignInParams('https://store.example/#access_token=x&refresh_token=y')).toBe('https://store.example/');
  });

  it('leaves an ordinary address alone', () => {
    const href = 'https://store.example/reports?tab=products#top';
    expect(withoutSignInParams(href)).toBe(href);
  });
});

describe('hasLinkCode', () => {
  it('finds a ?code= only in the query', () => {
    expect(hasLinkCode('https://store.example/?code=abc')).toBe(true);
    expect(hasLinkCode('https://store.example/#code=abc')).toBe(false);
  });
});
