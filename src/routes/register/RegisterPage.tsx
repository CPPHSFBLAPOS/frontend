import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Store } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { myOpenShifts } from '../../api/register';
import type { Shift } from '../../api/types';
import { item, list } from '../../components/motion';
import { Card, PageHeader, Skeleton } from '../../components/ui';
import { formatDateTime } from '../../lib/dates';
import { formatCents } from '../../lib/money';
import { OpenShift } from './OpenShift';
import { RegisterScreen } from './RegisterScreen';

const KEY = 'fbla-shift';

function cachedShift(): Shift | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Shift) : null;
  } catch {
    return null;
  }
}

export default function RegisterPage() {
  const qc = useQueryClient();
  const shifts = useQuery({ queryKey: ['open-shifts'], queryFn: myOpenShifts });
  const [selected, setSelected] = useState<string | null>(() => cachedShift()?.id ?? null);

  const choose = (s: Shift | null) => {
    setSelected(s?.id ?? null);
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {
      // Ignore.
    }
  };

  // Offline after a reload: keep selling on the shift we already had.
  const list_ = shifts.data ?? (shifts.isError ? [cachedShift()].filter(Boolean) as Shift[] : undefined);
  const shift = list_?.find((s) => s.id === selected) ?? (list_?.length === 1 ? list_[0] : undefined);

  if (!list_) {
    return (
      <div className="grid gap-4 pt-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (shift) {
    return (
      <RegisterScreen
        key={shift.id}
        shift={shift}
        onClosed={() => {
          choose(null);
          void qc.invalidateQueries({ queryKey: ['open-shifts'] });
        }}
        onSwitch={() => choose(null)}
      />
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Register" title="Start a shift">
        No sale can be rung without an open shift. Pick who is working and count the drawer.
      </PageHeader>
      {list_.length > 1 && (
        <Card className="mb-5 p-5">
          <p className="eyebrow mb-3">Open shifts on this account</p>
          <motion.div variants={list} initial="initial" animate="animate" className="grid gap-2 sm:grid-cols-2">
            {list_.map((s) => (
              <motion.button
                key={s.id}
                variants={item}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => choose(s)}
                className="flex items-center justify-between rounded-lg border border-rule bg-field px-4 py-3 text-left hover:border-navy"
              >
                <span>
                  <b>
                    Shift #{s.number} · {s.cashier_name}
                  </b>
                  <span className="block text-sm text-ink-2">
                    Opened {formatDateTime(s.opened_at)} · drawer {formatCents(s.expected_cash_cents)}
                  </span>
                </span>
                <ArrowRight className="size-4 text-navy" />
              </motion.button>
            ))}
          </motion.div>
        </Card>
      )}
      <OpenShift
        onOpened={async (id) => {
          const fresh = await qc.fetchQuery({ queryKey: ['open-shifts'], queryFn: myOpenShifts });
          choose(fresh.find((s) => s.id === id) ?? null);
        }}
      />
      <p className="mt-6 flex items-center gap-2 text-sm text-ink-3">
        <Store className="size-4" /> Keep the store laptop signed in as the Register account. Cashiers identify themselves with their PIN.
      </p>
    </div>
  );
}
