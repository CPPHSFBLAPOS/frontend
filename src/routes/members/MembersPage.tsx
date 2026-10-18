import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { listMembers, saveMember, setPin, type MemberInput } from '../../api/admin';
import type { MemberRow, Role } from '../../api/types';
import { DataTable } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { Segmented } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { Button, ErrorNote, Field, Input, PageHeader, Pill, Select, Skeleton } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { filterMembers, membersNeedingPinFirst, needsPin, type MemberFilter } from '../../lib/membership';

const ROLES: Array<{ id: Role | ''; label: string }> = [
  { id: '', label: 'No role (Super Admin only)' },
  { id: 'advisor', label: 'Advisor' },
  { id: 'president', label: 'President' },
  { id: 'treasurer', label: 'Treasurer' },
  { id: 'cashier', label: 'Cashier' },
  { id: 'register', label: 'Register account (shared device)' },
];

// Super Admins only (manage_members). Anyone who signs in becomes a Cashier
// here; a Super Admin sets their first PIN, changes roles, and blocks people
// by turning Active off.
export default function MembersPage() {
  const q = useQuery({ queryKey: ['members'], queryFn: listMembers });
  const [editing, setEditing] = useState<MemberRow | 'new' | null>(null);
  const [pinFor, setPinFor] = useState<MemberRow | null>(null);
  const [show, setShow] = useState<MemberFilter>('all');
  // New sign-ups without a PIN come first; the column headers still sort.
  const ordered = useMemo(() => membersNeedingPinFirst(q.data ?? []), [q.data]);
  const rows = filterMembers(ordered, show);
  const waiting = ordered.filter(needsPin).length;
  const blocked = ordered.filter((m) => !m.active).length;

  return (
    <div>
      <PageHeader
        eyebrow="Members"
        title="People and roles"
        actions={
          <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setEditing('new')}>
            Add member
          </Button>
        }
      >
        Anyone who signs in becomes a Cashier. Set a PIN before their first shift. Turn Active off to block someone. Every change is logged. Store
        only what the forms need: no student ID numbers.
      </PageHeader>
      <div className="mb-3">
        <Segmented
          options={[
            { id: 'all', label: 'Everyone' },
            { id: 'needs_pin', label: `Needs PIN (${waiting})` },
            { id: 'blocked', label: `Blocked (${blocked})` },
          ]}
          value={show}
          onChange={setShow}
        />
      </div>
      {q.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(m) => m.id}
          onRowClick={setEditing}
          csvName="members"
          empty={show === 'needs_pin' ? 'Everyone has a PIN.' : show === 'blocked' ? 'Nobody is blocked.' : 'Nothing here yet.'}
          columns={[
            {
              key: 'name',
              label: 'Name',
              value: (m) => m.display_name,
              render: (m) => (
                <span>
                  <b>{m.display_name}</b>
                  <span className="block text-xs text-ink-3">{m.email}</span>
                </span>
              ),
            },
            { key: 'role', label: 'Role', value: (m) => m.role ?? '', render: (m) => (m.role ? <Pill tone="navy">{m.role}</Pill> : '—') },
            { key: 'grade', label: 'Grade', value: (m) => m.grade },
            {
              key: 'flags',
              label: '',
              render: (m) => (
                <span className="flex flex-wrap gap-1">
                  {needsPin(m) && <Pill tone="warn">Needs PIN</Pill>}
                  {m.is_super_admin && <Pill tone="gold">Super Admin</Pill>}
                  {!m.active && <Pill tone="bad">Blocked</Pill>}
                  {!m.linked && m.active && <Pill>Not signed in yet</Pill>}
                </span>
              ),
            },
            {
              key: 'pin',
              label: 'PIN',
              render: (m) =>
                m.role === 'register' ? (
                  '—'
                ) : (
                  <Button
                    size="sm"
                    variant={m.has_pin ? 'ghost' : 'secondary'}
                    icon={<KeyRound className="size-3.5" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPinFor(m);
                    }}
                  >
                    {m.has_pin ? 'Reset' : 'Set PIN'}
                  </Button>
                ),
            },
          ]}
        />
      )}
      <MemberModal member={editing} onClose={() => setEditing(null)} />
      <PinModal key={pinFor?.id ?? 'none'} member={pinFor} onClose={() => setPinFor(null)} />
    </div>
  );
}

function MemberModal({ member, onClose }: { member: MemberRow | 'new' | null; onClose: () => void }) {
  return (
    <Modal open={member !== null} onClose={onClose} title={member === 'new' ? 'Add a member' : 'Edit member'} size="md">
      {member !== null && <MemberForm key={member === 'new' ? 'new' : member.id} member={member === 'new' ? null : member} onClose={onClose} />}
    </Modal>
  );
}

function MemberForm({ member, onClose }: { member: MemberRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useAuth();
  const [m, setM] = useState<MemberInput>({
    id: member?.id ?? null,
    email: member?.email ?? '',
    display_name: member?.display_name ?? '',
    grade: member?.grade ?? null,
    role: member?.role ?? 'cashier',
    is_super_admin: member?.is_super_admin ?? false,
    active: member?.active ?? true,
  });
  const save = useMutation({
    mutationFn: () => saveMember(m),
    onSuccess: () => {
      toast.good(member ? 'Saved' : `${m.display_name} added`, member ? undefined : 'They can sign in with a code sent to that email.');
      void qc.invalidateQueries({ queryKey: ['members'] });
      void qc.invalidateQueries({ queryKey: ['directory'] });
      // A Super Admin may have changed their own row or PIN.
      void qc.invalidateQueries({ queryKey: ['me'] });
      onClose();
    },
  });
  return (
    <div className="grid gap-3">
      <Field label="School email">
        <Input type="email" value={m.email} onChange={(e) => setM({ ...m, email: e.target.value })} />
      </Field>
      <Field label="Name">
        <Input value={m.display_name} onChange={(e) => setM({ ...m, display_name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role">
          <Select value={m.role ?? ''} onChange={(e) => setM({ ...m, role: (e.target.value || null) as Role | null })}>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Grade">
          <Select value={m.grade ?? ''} onChange={(e) => setM({ ...m, grade: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>
            {[9, 10, 11, 12].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {me?.is_super_admin && (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={m.is_super_admin} onChange={(e) => setM({ ...m, is_super_admin: e.target.checked })} className="size-4 accent-[var(--gold)]" />
          Super Admin (runs the system; their role still decides what they can sign)
        </label>
      )}
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={m.active} onChange={(e) => setM({ ...m, active: e.target.checked })} className="size-4 accent-[var(--navy)]" />
        Active. Turn off to block them: they lose access to the store app and cannot sign up again with this email.
      </label>
      <ErrorNote error={save.error} />
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={save.isPending} disabled={!m.email.includes('@') || !m.display_name.trim()} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
    </div>
  );
}

function PinModal({ member, onClose }: { member: MemberRow | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [pin, setPinValue] = useState('');
  const save = useMutation({
    mutationFn: () => setPin(member!.id, pin),
    onSuccess: () => {
      toast.good(`PIN set for ${member?.display_name}`);
      setPinValue('');
      void qc.invalidateQueries({ queryKey: ['members'] });
      void qc.invalidateQueries({ queryKey: ['directory'] });
      // A Super Admin may have changed their own row or PIN.
      void qc.invalidateQueries({ queryKey: ['me'] });
      onClose();
    },
  });
  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      size="sm"
      title={`PIN for ${member?.display_name ?? ''}`}
      subtitle="4 digits. Used at the register and to approve voids, refunds and drawer differences. 5 wrong tries lock it for 5 minutes."
      footer={
        <Button variant="primary" loading={save.isPending} disabled={!/^\d{4}$/.test(pin)} onClick={() => save.mutate()}>
          Set PIN
        </Button>
      }
    >
      <Input
        type="password"
        inputMode="numeric"
        maxLength={4}
        autoComplete="new-password"
        value={pin}
        onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className="num h-14 text-center text-3xl tracking-[0.6em]"
        aria-label="New PIN"
      />
      <div className="mt-2">
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  );
}
