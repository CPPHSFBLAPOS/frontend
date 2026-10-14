import { ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import type { DirectoryEntry } from '../../api/types';
import { Field, Input, Select } from '../../components/ui';

export type OfficerApproval = { officerId: string; pin: string };

// eslint-disable-next-line react-refresh/only-export-components
export function isOfficer(d: DirectoryEntry) {
  return d.is_super_admin || d.role === 'advisor' || d.role === 'president' || d.role === 'treasurer';
}

// An officer picks their name and types their PIN to approve something a
// cashier cannot do alone.
export function OfficerPin({
  directory,
  value,
  onChange,
  excludeId,
  reason = 'An officer must approve this.',
}: {
  directory: DirectoryEntry[];
  value: OfficerApproval;
  onChange: (v: OfficerApproval) => void;
  excludeId?: string;
  reason?: string;
}) {
  const officers = directory.filter((d) => isOfficer(d) && d.has_pin && d.id !== excludeId);
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="overflow-hidden rounded-lg border border-gold/60 bg-gold-soft"
    >
      <div className="grid gap-3 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-warn">
          <ShieldCheck className="size-4" /> {reason}
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <Field label="Officer">
            <Select value={value.officerId} onChange={(e) => onChange({ ...value, officerId: e.target.value })}>
              <option value="">Choose…</option>
              {officers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Officer PIN">
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              value={value.pin}
              onChange={(e) => onChange({ ...value, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              className="num tracking-[0.4em]"
            />
          </Field>
        </div>
      </div>
    </motion.div>
  );
}
