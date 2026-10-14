import { useQuery } from '@tanstack/react-query';
import { ClipboardSignature, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { listPreauths } from '../../api/preauth';
import { item, list } from '../../components/motion';
import { Segmented } from '../../components/Tabs';
import { Button, EmptyState, PageHeader, Pill, Skeleton } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { daysBetween, formatDate, localISODate } from '../../lib/dates';
import { formatCents } from '../../lib/money';
import { STATUS_LABEL, STATUS_TONE } from './model';

export default function PreauthList() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'open' | 'all' | 'closed'>('open');
  const q = useQuery({ queryKey: ['preauths'], queryFn: listPreauths });
  const rows = (q.data ?? []).filter((p) => (filter === 'all' ? true : filter === 'closed' ? p.status === 'closed' : p.status !== 'closed'));
  const today = localISODate();

  return (
    <div>
      <PageHeader
        eyebrow="Purchasing"
        title="Pre-auth purchases"
        actions={
          can('preauth_request') && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/preauth/new')}>
              New request
            </Button>
          )
        }
      >
        No Sam's Club purchase happens without a signed Preauthorization Purchase Order Form, and nothing reaches the shelf until it is received.
      </PageHeader>
      <div className="mb-4">
        <Segmented
          options={[
            { id: 'open', label: 'Open' },
            { id: 'closed', label: 'Closed' },
            { id: 'all', label: 'All' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>
      {q.isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<ClipboardSignature className="size-6" />} title="No forms here.">
          {can('preauth_request') ? 'Start a request to buy from Sam’s Club.' : 'Officers start requests; you’ll see them here.'}
        </EmptyState>
      ) : (
        <motion.div key={filter} variants={list} initial="initial" animate="animate" className="grid gap-2.5">
          {rows.map((p) => {
            const left = p.receipt_due_date ? daysBetween(today, p.receipt_due_date) : null;
            return (
              <motion.div key={p.id} variants={item} whileHover={{ x: 3 }}>
                <Link
                  to={`/preauth/${p.id}`}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-rule bg-paper px-4 py-3 shadow-card transition-shadow hover:shadow-lift"
                >
                  <span className="num grid size-12 place-items-center rounded-xl bg-navy-soft text-sm font-bold text-navy">#{p.number}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {p.student_name} · {p.vendor}
                    </span>
                    <span className="block text-sm text-ink-2">
                      Requested {formatDate(p.request_date, 'long')}
                      {p.status === 'purchased' && left !== null && (left >= 0 ? ` · receipt due in ${left} day${left === 1 ? '' : 's'}` : '')}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="num font-semibold">{formatCents(p.grand_total_cents)}</span>
                    {p.overdue ? <Pill tone="bad">Receipt overdue</Pill> : <Pill tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Pill>}
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
