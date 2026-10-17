'use server';

import { z } from 'zod';
import { ensureStepUp, requireAdmin } from '@/lib/auth';
import { callRpc, runAction, UserError, type ActionResult } from '@/lib/action';
import { hubDb } from '@/lib/supabase-server';
import { requestMeta } from '@/lib/request';
import { reason, snowflake } from '@/lib/validation';
import type { Permission } from '@/lib/roles';
import { SLUG } from './db';
import { getGuildInfo } from '@/lib/discord';

const base = z.object({ reason, confirm: z.string().optional(), code: z.string().optional() });

/** Actions that always need a fresh authenticator code, even right after sign-in. */
const ALWAYS_VERIFY = new Set<Permission>(['maintenance.set']);

async function gate(permission: Permission, fd: FormData) {
  const { admin } = await requireAdmin({ product: SLUG, permission });
  await ensureStepUp(admin, permission, String(fd.get('code') ?? '').trim() || undefined, ALWAYS_VERIFY.has(permission));
  const meta = await requestMeta();
  return { admin, ...meta, d: base.parse(Object.fromEntries(fd)) };
}

/** Typed confirmation is verified here too, never only in the browser. */
function mustMatch(typed: string | undefined, expected: string | string[]) {
  const ok = Array.isArray(expected) ? expected : [expected];
  if (!ok.includes((typed ?? '').trim())) throw new UserError(`Type "${ok[0]}" exactly to confirm.`);
}

/** Accepted confirmations: the server's Discord name (when known) or its ID. */
async function serverLabel(guildId: string): Promise<string[]> {
  const info = await getGuildInfo(guildId);
  return info?.name ? [info.name, guildId] : [guildId];
}

async function billingOp(op: string, permission: Permission, fd: FormData, opts: { typed: boolean; days?: (fd: FormData) => number; note?: boolean }) {
  const guildId = snowflake.parse(fd.get('guildId'));
  const { admin, ip, ua, d } = await gate(permission, fd);
  if (opts.typed) mustMatch(d.confirm, await serverLabel(guildId));
  const days = opts.days ? opts.days(fd) : 0;
  await callRpc(hubDb(), 'pn_billing_change', {
    p_op: op, p_guild: guildId, p_days: days, p_note: opts.note ? d.reason : null,
    p_admin: admin.id, p_admin_email: admin.email, p_ip: ip, p_ua: ua, p_reason: d.reason,
  });
}

const daysField = (min: number, max: number) => (fd: FormData) =>
  z.coerce.number().int().min(min).max(max).refine((n) => n !== 0, 'Days cannot be 0').parse(fd.get('days'));

export async function extendTrial(fd: FormData): Promise<ActionResult> {
  return runAction(async () => { await billingOp('extend_trial', 'server.trial', fd, { typed: false, days: daysField(1, 90) }); return 'Trial extended'; });
}
export async function adjustPaidDays(fd: FormData): Promise<ActionResult> {
  return runAction(async () => { await billingOp('adjust_paid', 'server.adjust_paid', fd, { typed: true, days: daysField(-365, 365) }); return 'Paid days updated'; });
}
export async function whitelistServer(fd: FormData): Promise<ActionResult> {
  return runAction(async () => { await billingOp('whitelist', 'server.whitelist', fd, { typed: true, note: true }); return 'Server whitelisted'; });
}
export async function removeWhitelist(fd: FormData): Promise<ActionResult> {
  return runAction(async () => { await billingOp('unwhitelist', 'server.whitelist', fd, { typed: true, note: true }); return 'Whitelist removed'; });
}
export async function markBotRemoved(fd: FormData): Promise<ActionResult> {
  return runAction(async () => { await billingOp('mark_bot_removed', 'server.mark_removed', fd, { typed: true }); return 'Marked as bot removed'; });
}

export async function resetReminders(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const guildId = snowflake.parse(fd.get('guildId'));
    const { admin, ip, ua, d } = await gate('reminder.send', fd);
    await callRpc(hubDb(), 'pn_reminder_reset', { p_guild: guildId, p_admin: admin.id, p_admin_email: admin.email, p_ip: ip, p_ua: ua, p_reason: d.reason });
    return 'Reminder counters reset. The bot will send the next reminder on its schedule.';
  });
}

async function contactOp(op: 'optout' | 'optin' | 'delete', permission: Permission, fd: FormData) {
  const userId = snowflake.parse(fd.get('userId'));
  const { admin, ip, ua, d } = await gate(permission, fd);
  if (op === 'delete') mustMatch(d.confirm, userId);
  await callRpc(hubDb(), 'pn_contact_change', { p_op: op, p_user: userId, p_admin: admin.id, p_admin_email: admin.email, p_ip: ip, p_ua: ua, p_reason: d.reason });
}
export async function disableReminders(fd: FormData): Promise<ActionResult> {
  return runAction(async () => { await contactOp('optout', 'contact.optin_out', fd); return 'Email reminders disabled'; });
}
export async function enableReminders(fd: FormData): Promise<ActionResult> {
  return runAction(async () => { await contactOp('optin', 'contact.optin_out', fd); return 'Email reminders enabled'; });
}
export async function deleteContact(fd: FormData): Promise<ActionResult> {
  return runAction(async () => { await contactOp('delete', 'contact.delete', fd); return 'Contact deleted'; });
}

export async function setMaintenance(fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const enabled = z.enum(['true', 'false']).parse(fd.get('enabled')) === 'true';
    const { admin, ip, ua, d } = await gate('maintenance.set', fd);
    mustMatch(d.confirm, 'MAINTENANCE');
    await callRpc(hubDb(), 'pn_maintenance_set', { p_enabled: enabled, p_admin: admin.id, p_admin_email: admin.email, p_ip: ip, p_ua: ua, p_reason: d.reason });
    return enabled ? 'Maintenance mode is ON' : 'Maintenance mode is OFF';
  });
}
