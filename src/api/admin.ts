import { rpc } from './rpc';
import { supabase } from './supabase';
import type { DirectoryEntry, LogEntry, MemberRow, Role, Settings } from './types';

export const listMembers = () => rpc<MemberRow[]>('list_members');
export const memberDirectory = () => rpc<DirectoryEntry[]>('member_directory');

export type MemberInput = {
  id: string | null;
  email: string;
  display_name: string;
  grade: number | null;
  role: Role | null;
  is_super_admin: boolean;
  active: boolean;
};

export const saveMember = (m: MemberInput) =>
  rpc<string>('save_member', {
    p_id: m.id,
    p_email: m.email,
    p_display_name: m.display_name,
    p_grade: m.grade,
    p_role: m.role,
    p_is_super_admin: m.is_super_admin,
    p_active: m.active,
  });

export const setPin = (memberId: string, pin: string) => rpc<void>('set_pin', { p_member_id: memberId, p_pin: pin });

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
  if (error) throw new Error(error.message);
  return data as Settings;
}

export const saveSettings = (patch: Partial<Settings>) => rpc<void>('save_settings', { p: patch });

export type LogFilter = {
  from?: string;
  to?: string;
  actorId?: string;
  action?: string;
  recordType?: string;
  recordId?: string;
  minCents?: number | null;
  maxCents?: number | null;
  limit?: number;
};

export async function listLog(f: LogFilter): Promise<LogEntry[]> {
  let q = supabase.from('log_entries').select('*').order('seq', { ascending: false }).limit(f.limit ?? 300);
  if (f.from) q = q.gte('at', `${f.from}T00:00:00-05:00`);
  if (f.to) q = q.lte('at', `${f.to}T23:59:59.999-04:00`);
  if (f.actorId) q = q.eq('actor_id', f.actorId);
  if (f.action) q = q.ilike('action', `%${f.action}%`);
  if (f.recordType) q = q.eq('record_type', f.recordType);
  if (f.recordId) q = q.eq('record_id', f.recordId);
  if (f.minCents !== null && f.minCents !== undefined) q = q.gte('amount_cents', f.minCents);
  if (f.maxCents !== null && f.maxCents !== undefined) q = q.lte('amount_cents', f.maxCents);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as LogEntry[];
}

export const verifyLog = () =>
  rpc<{ ok: boolean; checked: number; first_bad_seq: number | null; problem: string | null }>('verify_log');
