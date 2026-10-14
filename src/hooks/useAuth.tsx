import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { recordSignIn, whoami } from '../api/auth';
import { supabase } from '../api/supabase';
import type { Me, Permission } from '../api/types';

type AuthState = {
  session: Session | null;
  loading: boolean;
  me: Me | null;
  notMember: boolean;
  can: (p: Permission) => boolean;
};

const AuthContext = createContext<AuthState>({ session: null, loading: true, me: null, notMember: false, can: () => false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') qc.clear();
      if (event === 'SIGNED_IN' && s) {
        // Log each sign-in once per browser session.
        const key = `signed-in:${s.user.id}`;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          setTimeout(() => void recordSignIn().catch(() => {}), 0);
        }
      }
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const meQuery = useQuery({
    queryKey: ['me', session?.user.id],
    queryFn: whoami,
    enabled: Boolean(session),
    staleTime: 5 * 60 * 1000,
  });

  const me = meQuery.data ?? null;
  const value: AuthState = {
    session,
    loading: !ready || (Boolean(session) && meQuery.isLoading),
    me,
    notMember: Boolean(session) && meQuery.isSuccess && !me,
    can: (p) => Boolean(me?.permissions.includes(p)),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
