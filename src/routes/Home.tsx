import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardSignature,
  CreditCard,
  Database,
  Loader2,
  Server,
  ShoppingCart,
  XCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { listPreauths } from '../api/preauth';
import { pendingOutageSales } from '../api/register';
import { checkHealth } from '../api/rpc';
import { supabase } from '../api/supabase';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { item, list } from '../components/motion';
import { Card, PageHeader, Pill, cx } from '../components/ui';
import { useProducts } from '../hooks/queries';
import { useAuth } from '../hooks/useAuth';
import { formatDate } from '../lib/dates';
import { formatCents } from '../lib/money';

function Check({ label, icon: Icon, state, detail }: { label: string; icon: typeof Database; state: 'pending' | 'ok' | 'bad'; detail?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-lg bg-field text-ink-2">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="truncate text-xs text-ink-3">{detail}</p>
      </div>
      <motion.span key={state} initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }}>
        {state === 'pending' ? (
          <Loader2 className="size-5 animate-spin text-ink-3" />
        ) : state === 'ok' ? (
          <CheckCircle2 className="size-5 text-good" />
        ) : (
          <XCircle className="size-5 text-bad" />
        )}
      </motion.span>
    </div>
  );
}

const ACTIONS = [
  { to: '/register', label: 'Open the register', body: 'Shift, sales, voids and refunds', icon: ShoppingCart, perm: 'ring_sales' as const },
  { to: '/preauth', label: 'Pre-auth purchases', body: 'Sam’s Club requests and approvals', icon: ClipboardSignature, perm: 'preauth_view' as const },
  { to: '/inventory', label: 'Inventory', body: 'Products, prices, counts', icon: Boxes, perm: 'edit_products' as const },
  { to: '/gift-cards', label: 'Gift cards', body: 'Issue, look up, print', icon: CreditCard, perm: 'issue_promo' as const },
  { to: '/reports', label: 'Reports', body: 'Dashboard and Treasurer reports', icon: BarChart3, perm: 'view_reports' as const },
];

export function Home() {
  const { me, can } = useAuth();

  const db = useQuery({
    queryKey: ['check-db'],
    queryFn: async () => {
      const { error } = await supabase.from('settings').select('id').limit(1);
      if (error) throw error;
      return true;
    },
    retry: 0,
  });
  const fn = useQuery({ queryKey: ['check-fn'], queryFn: checkHealth, retry: 0 });
  const preauths = useQuery({ queryKey: ['preauths'], queryFn: listPreauths, enabled: can('preauth_view') });
  const outage = useQuery({ queryKey: ['pending-outage'], queryFn: pendingOutageSales, enabled: can('verify_outage') });
  const products = useProducts();

  const waitingOnMe = (preauths.data ?? []).filter(
    (p) =>
      (can('preauth_approve') && p.status === 'awaiting_advisor') ||
      (p.requester_id === me?.id && (p.status === 'rejected' || p.status === 'draft')) ||
      (can('receiving') && p.status === 'purchased' && !p.overdue),
  );
  const overdue = (preauths.data ?? []).filter((p) => p.overdue);
  const low = (products.data ?? []).filter((p) => p.on_hand <= p.low_stock_alert);
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader eyebrow={formatDate(new Date().toISOString(), 'long')} title="CPPHS FBLA Store">
        {greeting}, {me?.display_name.split(' ')[0]}.
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-5">
          <motion.div variants={list} initial="initial" animate="animate" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ACTIONS.filter((a) => can(a.perm)).map((a) => (
              <motion.div key={a.to} variants={item} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
                <Link to={a.to} className="group flex h-full items-start gap-3 rounded-xl border border-rule bg-paper p-4 shadow-card transition-shadow hover:shadow-lift">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy-soft text-navy transition-colors group-hover:bg-navy group-hover:text-on-navy">
                    <a.icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-semibold">
                      {a.label}
                      <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-2">{a.body}</span>
                  </span>
                </Link>
              </motion.div>
            ))}
          </motion.div>

          {(waitingOnMe.length > 0 || overdue.length > 0 || (outage.data?.length ?? 0) > 0) && (
            <Card initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-5">
              <p className="eyebrow">Needs you</p>
              <h2 className="display mb-3 text-xl font-bold">To do</h2>
              <motion.ul variants={list} initial="initial" animate="animate" className="divide-y divide-rule">
                {overdue.map((p) => (
                  <motion.li key={`o${p.id}`} variants={item}>
                    <Link to={`/preauth/${p.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-navy">
                      <span>
                        Receipt overdue on pre-auth #{p.number} ({p.student_name})
                      </span>
                      <Pill tone="bad">Overdue</Pill>
                    </Link>
                  </motion.li>
                ))}
                {waitingOnMe.map((p) => (
                  <motion.li key={p.id} variants={item}>
                    <Link to={`/preauth/${p.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-navy">
                      <span>
                        Pre-auth #{p.number}: {formatCents(p.grand_total_cents)} from {p.student_name}
                      </span>
                      <Pill tone={p.status === 'rejected' ? 'bad' : 'gold'}>
                        {p.status === 'awaiting_advisor' ? 'Waiting for you' : p.status === 'purchased' ? 'Receive it' : p.status === 'rejected' ? 'Sent back' : 'Draft'}
                      </Pill>
                    </Link>
                  </motion.li>
                ))}
                {(outage.data ?? []).map((s) => (
                  <motion.li key={s.id} variants={item}>
                    <Link to="/register?tab=outage" className="flex items-center justify-between gap-3 py-2.5 hover:text-navy">
                      <span>
                        Outage entry #{s.number} from {formatDate(s.occurred_on)} ({formatCents(s.total_cents)}) needs a second officer
                      </span>
                      <Pill tone="warn">Verify</Pill>
                    </Link>
                  </motion.li>
                ))}
              </motion.ul>
            </Card>
          )}

          {can('edit_products') && low.length > 0 && (
            <Card initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">Stock</p>
                  <h2 className="display text-xl font-bold">
                    <AnimatedNumber value={low.length} format={(n) => String(n)} /> running low
                  </h2>
                </div>
                <AlertTriangle className="size-6 text-warn" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {low.slice(0, 12).map((p) => (
                  <span key={p.id} className={cx('rounded-full px-3 py-1 text-sm', p.on_hand <= 0 ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn')}>
                    {p.name} · <b className="num">{p.on_hand}</b>
                  </span>
                ))}
              </div>
              {can('view_reports') && (
                <Link to="/reports?tab=restock" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy">
                  Restock report <ArrowRight className="size-4" />
                </Link>
              )}
            </Card>
          )}
        </div>

        <Card initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="grid content-start gap-4 p-5">
          <div>
            <p className="eyebrow">System</p>
            <h2 className="display text-xl font-bold">Status</h2>
          </div>
          <Check
            label="Database (Supabase)"
            icon={Database}
            state={db.isLoading ? 'pending' : db.isSuccess ? 'ok' : 'bad'}
            detail={db.isError ? 'Not answering. A paused project needs restoring.' : 'Reached'}
          />
          <Check
            label="Functions (Netlify)"
            icon={Server}
            state={fn.isLoading ? 'pending' : fn.isSuccess ? 'ok' : 'bad'}
            detail={
              fn.isError
                ? 'Not answering. Lookups, emails and PDFs wait until it is back.'
                : fn.data?.configured
                  ? `Claude ${fn.data.configured.anthropic ? 'ready' : 'not set'} · Email ${fn.data.configured.resend ? 'ready' : 'not set'}`
                  : 'Reached'
            }
          />
          {me && (
            <div className="rounded-lg bg-field p-3 text-sm">
              <p className="font-semibold">{me.display_name}</p>
              <p className="text-ink-2">{me.email}</p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {me.role && <Pill tone="navy">{me.role}</Pill>}
                {me.is_super_admin && <Pill tone="gold">Super Admin</Pill>}
                {!me.has_pin && me.role && me.role !== 'register' && <Pill tone="warn">No PIN yet</Pill>}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
