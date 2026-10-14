import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Laptop, Save } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { saveSettings } from '../../api/admin';
import { deviceName, setDeviceName } from '../../api/supabase';
import type { Settings } from '../../api/types';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { useToast } from '../../components/Toast';
import { Button, Card, ErrorNote, Field, Input, MoneyInput, PageHeader, Skeleton, Textarea, cx } from '../../components/ui';
import { useSettings } from '../../hooks/queries';
import { localISODate, schoolYear, weekdaysBetween } from '../../lib/dates';
import { DEVICE_NAME_MAX } from '../../lib/device';
import { centsToInput, parseDollars } from '../../lib/money';

export default function SettingsPage() {
  const settings = useSettings();
  if (!settings.data) return <Skeleton className="mt-8 h-96" />;
  return <SettingsForm key={JSON.stringify(settings.data)} initial={settings.data} />;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SettingsForm({ initial }: { initial: Settings }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [s, setS] = useState({
    store_name: initial.store_name,
    float: centsToInput(initial.float_cents),
    tolerance: centsToInput(initial.over_short_tolerance_cents),
    limit: centsToInput(initial.preauth_limit_cents),
    warn: centsToInput(initial.preauth_warn_cents),
    due: String(initial.receipt_due_days),
    yearStart: initial.school_year_start,
    samsLimit: String(initial.sams_daily_limit),
    cacheDays: String(initial.sams_cache_days),
  });
  const sy = schoolYear();
  const [plan, setPlan] = useState({ from: initial.open_days[0] ?? sy.from, to: initial.open_days[initial.open_days.length - 1] ?? sy.to, weekdays: [1, 2, 3, 4, 5], skip: '' });
  const [openDays, setOpenDays] = useState<string[]>(initial.open_days);
  const [device, setDevice] = useState(deviceName());
  const left = openDays.filter((d) => d > localISODate()).length;

  const save = useMutation({
    mutationFn: () =>
      saveSettings({
        store_name: s.store_name,
        float_cents: parseDollars(s.float) ?? initial.float_cents,
        over_short_tolerance_cents: parseDollars(s.tolerance) ?? initial.over_short_tolerance_cents,
        preauth_limit_cents: parseDollars(s.limit) ?? initial.preauth_limit_cents,
        preauth_warn_cents: parseDollars(s.warn) ?? initial.preauth_warn_cents,
        receipt_due_days: Number(s.due) || initial.receipt_due_days,
        school_year_start: s.yearStart,
        sams_daily_limit: Number(s.samsLimit),
        sams_cache_days: Number(s.cacheDays),
        open_days: openDays,
      }),
    onSuccess: () => {
      toast.good('Settings saved', 'The change is in the transaction log.');
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const generate = () => {
    const skip = plan.skip.split(/[\s,]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    setOpenDays(weekdaysBetween(plan.from, plan.to, plan.weekdays, skip));
  };

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Store rules"
        actions={
          <Button variant="primary" icon={<Save className="size-4" />} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        }
      />
      <ErrorNote error={save.error} />
      <div className="mt-2 grid gap-5 lg:grid-cols-2">
        <Card className="grid content-start gap-3 p-5">
          <h2 className="display text-lg font-bold">Register</h2>
          <Field label="Store name">
            <Input value={s.store_name} onChange={(e) => setS({ ...s, store_name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starting cash float" hint="Default opening count">
              <MoneyInput value={s.float} onChange={(e) => setS({ ...s, float: e.target.value })} />
            </Field>
            <Field label="Over/short tolerance" hint="Beyond this needs a note and officer PIN">
              <MoneyInput value={s.tolerance} onChange={(e) => setS({ ...s, tolerance: e.target.value })} />
            </Field>
          </div>
        </Card>
        <Card className="grid content-start gap-3 p-5">
          <h2 className="display text-lg font-bold">Pre-auth</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Limit per form">
              <MoneyInput value={s.limit} onChange={(e) => setS({ ...s, limit: e.target.value })} />
            </Field>
            <Field label="Warn within">
              <MoneyInput value={s.warn} onChange={(e) => setS({ ...s, warn: e.target.value })} />
            </Field>
            <Field label="Receipt due (days after purchase)">
              <Input inputMode="numeric" value={s.due} onChange={(e) => setS({ ...s, due: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <Field label="School year starts">
              <Input type="date" value={s.yearStart} onChange={(e) => setS({ ...s, yearStart: e.target.value })} />
            </Field>
            <Field label="Sam's Club lookups per day" hint="Caps the Claude API cost">
              <Input inputMode="numeric" value={s.samsLimit} onChange={(e) => setS({ ...s, samsLimit: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <Field label="Reuse a listing for (days)">
              <Input inputMode="numeric" value={s.cacheDays} onChange={(e) => setS({ ...s, cacheDays: e.target.value.replace(/\D/g, '') })} />
            </Field>
          </div>
        </Card>
        <Card className="grid content-start gap-3 p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="display flex items-center gap-2 text-lg font-bold">
              <CalendarDays className="size-5" /> Open days
            </h2>
            <span className="text-sm text-ink-2">
              <AnimatedNumber value={openDays.length} format={(n) => String(n)} className="num font-semibold text-ink" /> planned ·{' '}
              <AnimatedNumber value={left} format={(n) => String(n)} className="num font-semibold text-ink" /> still ahead (used by the forecast)
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-[10rem_10rem_1fr]">
            <Field label="From">
              <Input type="date" value={plan.from} onChange={(e) => setPlan({ ...plan, from: e.target.value })} />
            </Field>
            <Field label="To">
              <Input type="date" value={plan.to} onChange={(e) => setPlan({ ...plan, to: e.target.value })} />
            </Field>
            <div className="grid gap-1.5">
              <span className="label">Open on</span>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d, i) => {
                  const on = plan.weekdays.includes(i);
                  return (
                    <motion.button
                      key={d}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setPlan({ ...plan, weekdays: on ? plan.weekdays.filter((x) => x !== i) : [...plan.weekdays, i] })}
                      className={cx('rounded-lg border px-2.5 py-1.5 text-sm font-semibold', on ? 'border-navy bg-navy text-on-navy' : 'border-rule-2')}
                    >
                      {d}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
          <Field label="Closed dates (holidays, breaks, testing days)" hint="YYYY-MM-DD, separated by spaces or commas">
            <Textarea rows={2} value={plan.skip} onChange={(e) => setPlan({ ...plan, skip: e.target.value })} placeholder="2026-11-26 2026-11-27 2026-12-24" />
          </Field>
          <div>
            <Button onClick={generate}>Fill open days</Button>
          </div>
          <MonthStrip days={openDays} />
        </Card>
        <Card className="grid content-start gap-3 p-5 lg:col-span-2">
          <h2 className="display flex items-center gap-2 text-lg font-bold">
            <Laptop className="size-5" /> This device
          </h2>
          <p className="text-sm text-ink-2">The transaction log records which device did each thing. Name this one (for example, “Store laptop”). Fancy quotes, dashes and emoji are turned into plain characters.</p>
          <div className="flex max-w-md gap-2">
            <Input value={device} onChange={(e) => setDevice(e.target.value)} maxLength={DEVICE_NAME_MAX} aria-label="Device name" />
            <Button
              onClick={() => {
                const saved = setDeviceName(device);
                setDevice(saved);
                toast.good(`Device name saved as “${saved}”`, 'Reload the app for it to take effect.');
              }}
            >
              Save name
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MonthStrip({ days }: { days: string[] }) {
  const byMonth = new Map<string, number>();
  for (const d of days) byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) ?? 0) + 1);
  const months = [...byMonth.entries()];
  if (months.length === 0) return null;
  const max = Math.max(...months.map(([, n]) => n));
  return (
    <div className="flex items-end gap-2 overflow-x-auto pt-2">
      {months.map(([m, n], i) => (
        <div key={m} className="flex min-w-12 flex-col items-center gap-1">
          <span className="num text-xs text-ink-2">{n}</span>
          <motion.div
            className="w-8 origin-bottom rounded-t bg-navy"
            style={{ height: `${(n / max) * 70 + 6}px` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.04, type: 'spring', stiffness: 180, damping: 18 }}
          />
          <span className="text-[11px] text-ink-3">{new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>
        </div>
      ))}
    </div>
  );
}
