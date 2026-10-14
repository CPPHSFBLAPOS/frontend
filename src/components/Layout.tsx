import {
  BarChart3,
  Boxes,
  ClipboardSignature,
  CreditCard,
  Home,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Settings as SettingsIcon,
  ShoppingCart,
  Sun,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { signOut } from '../api/auth';
import type { Permission } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { useOnline } from '../hooks/useOnline';
import { page } from './motion';
import { cx } from './ui';

type NavItem = { to: string; label: string; icon: typeof Home; perm?: Permission | Permission[] };

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/register', label: 'Register', icon: ShoppingCart, perm: 'ring_sales' },
  { to: '/inventory', label: 'Inventory', icon: Boxes, perm: 'edit_products' },
  { to: '/preauth', label: 'Pre-auth', icon: ClipboardSignature, perm: 'preauth_view' },
  { to: '/gift-cards', label: 'Gift cards', icon: CreditCard, perm: 'sell_gift_cards' },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'view_reports' },
  { to: '/log', label: 'Log', icon: ScrollText, perm: ['view_log', 'ring_sales'] },
  { to: '/members', label: 'Members', icon: Users, perm: 'manage_members' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, perm: 'change_settings' },
];

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(() => {
    try {
      return (localStorage.getItem('fbla-theme') as 'light' | 'dark' | null) ?? null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try {
      if (theme) localStorage.setItem('fbla-theme', theme);
    } catch {
      // Ignore.
    }
  }, [theme]);
  const dark = theme ? theme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return { dark, toggle: () => setTheme(dark ? 'light' : 'dark') };
}

export function Layout() {
  const { me, can } = useAuth();
  const location = useLocation();
  const online = useOnline();
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = NAV.filter((n) => !n.perm || (Array.isArray(n.perm) ? n.perm.some(can) : can(n.perm)));
  const section = `/${location.pathname.split('/')[1] ?? ''}`;

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-40 border-b-[3px] border-gold bg-band text-band-ink">
        <div className="mx-auto flex max-w-[1240px] items-center gap-4 px-4 py-2.5 sm:px-5">
          <NavLink to="/" className="flex min-w-0 shrink-0 flex-col leading-tight">
            <b className="display text-[15.5px] font-bold tracking-wide">CPPHS FBLA Store</b>
            <span className="hidden text-[12px] text-band-ink-2 sm:block">
              {me?.display_name}
              {me?.role ? ` · ${me.role[0].toUpperCase()}${me.role.slice(1)}` : me?.is_super_admin ? ' · Super Admin' : ''}
            </span>
          </NavLink>

          <LayoutGroup id="main-nav">
            <nav className="hidden flex-1 items-center gap-0.5 overflow-x-auto lg:flex" aria-label="Main">
              {items.map((n) => {
                const active = n.to === '/' ? location.pathname === '/' : section === n.to;
                return (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    className={cx('relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold', active ? 'text-band' : 'text-band-ink-2 hover:text-band-ink')}
                  >
                    {active && (
                      <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-band-ink" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
                    )}
                    <n.icon className="relative size-4" />
                    <span className="relative">{n.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </LayoutGroup>

          <div className="ml-auto flex items-center gap-1">
            <IconButton label={theme.dark ? 'Light mode' : 'Dark mode'} onClick={theme.toggle}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={theme.dark ? 'sun' : 'moon'} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
                  {theme.dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </motion.span>
              </AnimatePresence>
            </IconButton>
            <IconButton label="Sign out" onClick={() => void signOut()}>
              <LogOut className="size-4" />
            </IconButton>
            <IconButton label="Menu" onClick={() => setMenuOpen(true)} className="lg:hidden">
              <Menu className="size-5" />
            </IconButton>
          </div>
        </div>
        <AnimatePresence>
          {!online && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-warn text-white"
            >
              <p className="flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-semibold">
                <WifiOff className="size-4" /> Offline. The register keeps taking sales and sends them when the connection is back.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <MobileMenu items={items} onClose={() => setMenuOpen(false)} active={section} />
        )}
      </AnimatePresence>

      <main className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-5">
        <AnimatePresence mode="wait">
          <motion.div key={section} variants={page} initial="initial" animate="animate" exit="exit">
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function MobileMenu({ items, onClose, active }: { items: NavItem[]; onClose: () => void; active: string }) {
  const location = useLocation();
  const [start] = useState(location.pathname);
  useEffect(() => {
    if (location.pathname !== start) onClose();
  }, [location.pathname, start, onClose]);
  return (
    <motion.div className="fixed inset-0 z-50 lg:hidden" initial="closed" animate="open" exit="closed">
      <motion.div className="absolute inset-0 bg-scrim" variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }} onClick={onClose} />
      <motion.nav
        aria-label="Main"
        className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-1 border-l border-rule bg-paper p-4 shadow-lift"
        variants={{
          open: { x: 0, transition: { type: 'spring', stiffness: 380, damping: 36, staggerChildren: 0.03, delayChildren: 0.05 } },
          closed: { x: '100%', transition: { duration: 0.2 } },
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="display text-lg font-bold">Menu</span>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-field" aria-label="Close menu">
            <X className="size-4" />
          </button>
        </div>
        {items.map((n) => (
          <motion.div key={n.to} variants={{ open: { opacity: 1, x: 0 }, closed: { opacity: 0, x: 20 } }}>
            <NavLink
              to={n.to}
              className={cx('flex items-center gap-3 rounded-lg px-3 py-2.5 font-semibold', (n.to === '/' ? location.pathname === '/' : active === n.to) ? 'bg-navy-soft text-navy' : 'text-ink-2 hover:bg-field')}
            >
              <n.icon className="size-5" /> {n.label}
            </NavLink>
          </motion.div>
        ))}
      </motion.nav>
    </motion.div>
  );
}

function IconButton({ children, label, onClick, className }: { children: ReactNode; label: string; onClick: () => void; className?: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx('grid size-9 place-items-center rounded-lg text-band-ink-2 hover:bg-white/10 hover:text-band-ink', className)}
    >
      {children}
    </motion.button>
  );
}
