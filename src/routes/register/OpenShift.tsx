import { useMutation } from '@tanstack/react-query';
import { Check, UserRound } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { ApiError } from '../../api/rpc';
import { openShift } from '../../api/register';
import { deviceName } from '../../api/supabase';
import type { DirectoryEntry } from '../../api/types';
import { DrawerCount } from '../../components/DrawerCount';
import { item, list } from '../../components/motion';
import { PinPad } from '../../components/PinPad';
import { Segmented } from '../../components/Tabs';
import { Button, Card, MoneyInput, Spinner, cx } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useDirectory, useSettings } from '../../hooks/queries';
import { countTotal, toBreakdown, type Counts } from '../../lib/cash';
import { centsToInput, formatCents, parseDollars } from '../../lib/money';

// Three steps: who is working, their PIN, the opening count.
export function OpenShift({ onOpened }: { onOpened: (shiftId: string) => void }) {
  const directory = useDirectory();
  const settings = useSettings();
  const toast = useToast();
  const [cashier, setCashier] = useState<DirectoryEntry | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [mode, setMode] = useState<'count' | 'total'>('count');
  const [counts, setCounts] = useState<Counts>({});
  const [total, setTotal] = useState<string>('');

  const people = (directory.data ?? []).filter((d) => d.role !== 'register' && (d.role || d.is_super_admin));
  const float = settings.data?.float_cents ?? 0;
  const opening = mode === 'count' ? countTotal(counts) : (parseDollars(total || centsToInput(float)) ?? 0);

  const open = useMutation({
    mutationFn: () => openShift(cashier!.id, pin!, opening, mode === 'count' ? toBreakdown(counts) : null, deviceName()),
    onSuccess: (r) => {
      toast.good(`Shift #${r.number} is open`, `${cashier?.display_name} is on the register.`);
      onOpened(r.shift_id);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code?.startsWith('pin_')) {
        setPin(null);
        setPinError(err.message);
      } else toast.error(err);
    },
  });

  const step = !cashier ? 0 : !pin ? 1 : 2;

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-3 border-b border-rule bg-field text-sm">
        {['Who is working', 'PIN', 'Opening count'].map((label, i) => (
          <div key={label} className={cx('relative px-4 py-2.5 font-semibold', i <= step ? 'text-ink' : 'text-ink-3')}>
            <span className="num mr-1.5 text-xs text-ink-3">{i + 1}</span>
            {label}
            {i < step && <Check className="ml-1 inline size-4 text-good" />}
            {i === step && <motion.span layoutId="open-step" className="absolute inset-x-0 bottom-0 h-[3px] bg-gold" />}
          </div>
        ))}
      </div>
      <div className="p-5">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="who" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              {directory.isLoading ? (
                <Spinner />
              ) : (
                <motion.div variants={list} initial="initial" animate="animate" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {people.map((p) => (
                    <motion.button
                      key={p.id}
                      variants={item}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      disabled={!p.has_pin}
                      onClick={() => {
                        setCashier(p);
                        setPinError(null);
                      }}
                      className="flex items-center gap-3 rounded-xl border border-rule bg-paper p-3 text-left shadow-card enabled:hover:border-navy disabled:opacity-50"
                    >
                      <span className="grid size-10 place-items-center rounded-full bg-navy-soft font-bold text-navy">
                        {p.display_name
                          .split(' ')
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                      <span className="min-w-0">
                        <b className="block truncate">{p.display_name}</b>
                        <span className="text-xs capitalize text-ink-3">{p.has_pin ? (p.role ?? 'Super Admin') : 'No PIN yet'}</span>
                      </span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}
          {step === 1 && (
            <motion.div key="pin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col items-center gap-4 py-2">
              <p className="flex items-center gap-2 font-semibold">
                <UserRound className="size-4" /> {cashier?.display_name}, enter your PIN
              </p>
              <PinPad
                error={pinError}
                onComplete={(p) => {
                  setPin(p);
                  setPinError(null);
                }}
              />
              <Button variant="ghost" size="sm" onClick={() => setCashier(null)}>
                Not you?
              </Button>
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="count" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-ink-2">
                  Count the opening cash. The usual float is <b className="num text-ink">{formatCents(float)}</b>.
                </p>
                <Segmented
                  options={[
                    { id: 'count', label: 'By bill and coin' },
                    { id: 'total', label: 'Total only' },
                  ]}
                  value={mode}
                  onChange={setMode}
                />
              </div>
              {mode === 'count' ? (
                <DrawerCount counts={counts} onChange={setCounts} />
              ) : (
                <div className="max-w-xs">
                  <MoneyInput value={total} placeholder={centsToInput(float)} onChange={(e) => setTotal(e.target.value)} aria-label="Opening cash" />
                </div>
              )}
              {opening !== float && float > 0 && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                  That is {formatCents(opening - float, { sign: true })} from the usual float. Recount if that's a surprise.
                </motion.p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setPin(null)}>
                  Back
                </Button>
                <Button variant="primary" size="lg" loading={open.isPending} onClick={() => open.mutate()}>
                  Open shift with {formatCents(opening)}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
