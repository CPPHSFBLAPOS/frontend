import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { signOut } from './api/auth';
import { configured } from './api/supabase';
import type { Permission } from './api/types';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { Button, Card, EmptyState, Spinner } from './components/ui';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Home } from './routes/Home';
import { SignIn } from './routes/SignIn';

const Register = lazy(() => import('./routes/register/RegisterPage'));
const Inventory = lazy(() => import('./routes/inventory/InventoryPage'));
const PreauthList = lazy(() => import('./routes/preauth/PreauthList'));
const PreauthDetail = lazy(() => import('./routes/preauth/PreauthDetail'));
const GiftCards = lazy(() => import('./routes/giftcards/GiftCardsPage'));
const Reports = lazy(() => import('./routes/reports/ReportsPage'));
const Log = lazy(() => import('./routes/log/LogPage'));
const Members = lazy(() => import('./routes/members/MembersPage'));
const Settings = lazy(() => import('./routes/settings/SettingsPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
    // Mutations must run (and fail fast) while offline so the register can
    // queue the sale instead of waiting silently for the connection.
    mutations: { networkMode: 'always' },
  },
});

// Hiding a screen is a convenience, not security: the database rejects
// anything a role cannot do. This just keeps people out of screens that
// would only show errors.
function Need({ perm, children }: { perm: Permission | Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  const ok = Array.isArray(perm) ? perm.some(can) : can(perm);
  if (!ok) return <EmptyState title="This screen is not part of your role.">Ask the Advisor if you need it.</EmptyState>;
  return (
    <Suspense
      fallback={
        <div className="grid place-items-center py-24">
          <Spinner />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'register', element: <Need perm="ring_sales"><Register /></Need> },
      { path: 'inventory', element: <Need perm="edit_products"><Inventory /></Need> },
      { path: 'preauth', element: <Need perm="preauth_view"><PreauthList /></Need> },
      { path: 'preauth/:id', element: <Need perm="preauth_view"><PreauthDetail /></Need> },
      // Officers only: the card list and balances are readable only with
      // issue_promo. Cashiers sell, load and check cards at the register.
      { path: 'gift-cards', element: <Need perm="issue_promo"><GiftCards /></Need> },
      { path: 'reports', element: <Need perm="view_reports"><Reports /></Need> },
      { path: 'log', element: <Need perm={['view_log', 'ring_sales']}><Log /></Need> },
      { path: 'members', element: <Need perm="manage_members"><Members /></Need> },
      { path: 'settings', element: <Need perm="change_settings"><Settings /></Need> },
      { path: '*', element: <EmptyState title="That page does not exist." /> },
    ],
  },
]);

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-band">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="flex flex-col items-center gap-4"
      >
        <motion.img
          src="/favicon.svg"
          alt=""
          className="size-16 rounded-2xl"
          animate={{ rotate: [0, -6, 6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="display text-lg font-bold tracking-wide text-band-ink">CPPHS FBLA Store</span>
      </motion.div>
    </div>
  );
}

function Gate() {
  const { session, loading, notMember } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <SignIn />;
  if (notMember) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <Card initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-md p-8 text-center">
          <h1 className="display text-2xl font-bold">Ask the Advisor to add you.</h1>
          <p className="mt-2 text-ink-2">{session.user.email} is not on the store's member list.</p>
          <Button className="mt-6" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Card>
      </div>
    );
  }
  return <RouterProvider router={router} />;
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed inset-x-0 top-3 z-[70] mx-auto flex w-fit items-center gap-3 rounded-full border border-rule bg-paper px-4 py-2 shadow-lift"
        >
          <span className="text-sm font-semibold">A new version of the store app is ready.</span>
          <Button size="sm" variant="primary" icon={<RefreshCw className="size-3.5" />} onClick={() => void updateServiceWorker(true)}>
            Reload
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NotConfigured() {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="max-w-lg p-8">
        <h1 className="display text-2xl font-bold">CPPHS FBLA Store</h1>
        <p className="mt-2 text-ink-2">
          Set <code className="num">VITE_SUPABASE_URL</code> and <code className="num">VITE_SUPABASE_ANON_KEY</code> (see{' '}
          <code className="num">.env.example</code>) and reload.
        </p>
      </Card>
    </div>
  );
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {configured ? (
            <AuthProvider>
              <UpdatePrompt />
              <Gate />
            </AuthProvider>
          ) : (
            <NotConfigured />
          )}
        </ToastProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}
