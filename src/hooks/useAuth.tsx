import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ensureMember, recordSignIn, takeSignInLinkProblem, whoami } from '../api/auth';
import { supabase } from '../api/supabase';
import type { Me, Permission } from '../api/types';
import { useToast } from '../components/Toast';
import { isWaitingForApproval, resolveMembership, welcomeMessage } from '../lib/membership';

type AuthState = {
  session: Session | null;
  loading: boolean;
  me: Me | null;
  // Signed in, but a Super Admin turned their access off.
  blocked: boolean;
  // Signed in, but not a member for another reason (a password session, or
  // an email tied to another sign-in). Never true when blocked is.
  notMember: boolean;
  // The server's words for why (blocked or notMember).
  problem: string | null;
  // A member waiting for a Super Admin to set their first PIN.
  waiting: boolean;
  // Loading who you are failed (no connection, server error).
  error: string | null;
  // The page was opened from a sign-in link that did not sign anyone in.
  linkProblem: string | null;
  retry: () => void;
  can: (p: Permission) => boolean;
};

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  me: null,
  blocked: false,
  notMember: false,
  problem: null,
  waiting: false,
  error: null,
  linkProblem: null,
  retry: () => {},
  can: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  // Who signed in and has not had record_sign_in yet. It runs once the
  // member exists (a first sign-in creates the member in the 'me' query).
  const pendingSignIn = useRef<string | null>(null);
  const welcomed = useRef<string | null>(null);

  useEffect(() => {
    void Promise.all([takeSignInLinkProblem().catch(() => null), supabase.auth.getSession()]).then(([problem, { data }]) => {
      setLinkProblem(problem);
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') qc.clear();
      if (event === 'SIGNED_IN' && s) {
        // Log each sign-in once per browser session.
        const key = `signed-in:${s.user.id}`;
        try {
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1');
            pendingSignIn.current = s.user.id;
          }
        } catch {
          // Storage blocked: skip the sign-in log entry.
        }
      }
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  // whoami(), and ensure_member() only when whoami finds nobody. The result
  // is cached like any query, so a blocked person is not asked again until
  // the next refetch.
  const meQuery = useQuery({
    queryKey: ['me', session?.user.id],
    queryFn: () => resolveMembership({ whoami, ensureMember }),
    enabled: Boolean(session),
    staleTime: 5 * 60 * 1000,
    // While waiting for approval, check every 20 seconds so the app opens up
    // as soon as a Super Admin sets the PIN.
    refetchInterval: (q) => (isWaitingForApproval(q.state.data?.me ?? null) ? 20_000 : false),
  });

  const result = meQuery.data;
  const me = result?.me ?? null;

  useEffect(() => {
    if (!me || !session || pendingSignIn.current !== session.user.id) return;
    pendingSignIn.current = null;
    void recordSignIn().catch(() => {});
  }, [me, session]);

  useEffect(() => {
    if (!result?.joined || !result.me || welcomed.current === result.me.id) return;
    welcomed.current = result.me.id;
    toast.good(welcomeMessage(result.me), result.me.has_pin ? undefined : 'A Super Admin sets your PIN before your first shift.');
  }, [result, toast]);

  const noMember = Boolean(session) && meQuery.isSuccess && !me;
  const blocked = noMember && result?.problem?.kind === 'blocked';
  const value: AuthState = {
    session,
    loading: !ready || (Boolean(session) && meQuery.isLoading),
    me,
    blocked,
    notMember: noMember && !blocked,
    problem: noMember ? (result?.problem?.message ?? null) : null,
    waiting: isWaitingForApproval(me),
    error: Boolean(session) && !me && meQuery.isError ? (meQuery.error instanceof Error ? meQuery.error.message : String(meQuery.error)) : null,
    linkProblem,
    retry: () => void meQuery.refetch(),
    can: (p) => Boolean(me?.permissions.includes(p)),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
