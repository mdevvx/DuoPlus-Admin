import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { quoteBigInts } from '@/lib/bigjson';
import { readStamp, signStamp } from '@/lib/signed';
import { ABSOLUTE_MS, IDLE_MS, sessionState } from '@/lib/session-policy';
import { toCsv } from '@/lib/csv';
import { maskEmail } from '@/lib/format';
import { snowflake, likeTerm } from '@/lib/validation';
import { parseFlag, polarLink, subscriptionState } from '@/products/pulsenotify/state';
import { failures } from '../scripts/check-contrast';

describe('snowflakes', () => {
  it('survive JSON parsing as strings', () => {
    const parsed = JSON.parse(quoteBigInts('[{"guild_id":1234567890123456789,"n":42,"s":"id 1234567890123456789","f":1.5}]'));
    expect(parsed[0].guild_id).toBe('1234567890123456789');
    expect(parsed[0].n).toBe(42);
    expect(parsed[0].s).toBe('id 1234567890123456789');
    expect(parsed[0].f).toBe(1.5);
  });
  it('validates IDs', () => {
    expect(snowflake.safeParse('123456789012345678').success).toBe(true);
    expect(snowflake.safeParse('12; drop').success).toBe(false);
  });
});

describe('sessions', () => {
  it('signs and rejects forged or foreign stamps', async () => {
    const s = await signStamp('x'.repeat(32), 'active', 'user-1', 1_700_000_000_000);
    expect(await readStamp('x'.repeat(32), 'active', 'user-1', s)).toBe(1_700_000_000_000);
    expect(await readStamp('x'.repeat(32), 'active', 'user-2', s)).toBeNull();
    expect(await readStamp('y'.repeat(32), 'active', 'user-1', s)).toBeNull();
    expect(await readStamp('x'.repeat(32), 'started', 'user-1', s)).toBeNull();
    expect(await readStamp('x'.repeat(32), 'active', 'user-1', undefined)).toBeNull();
  });
  it('enforces 8h absolute and 30m idle', () => {
    const t = 1e12;
    expect(sessionState(t, t - 1000, t - 1000)).toBe('ok');
    expect(sessionState(t, t - ABSOLUTE_MS - 1, t - 1000)).toBe('expired');
    expect(sessionState(t, t - 3600_000, t - IDLE_MS - 1)).toBe('idle');
    expect(sessionState(t, null, t)).toBe('missing');
  });
});

describe('subscription state', () => {
  const now = Date.parse('2026-10-17T00:00:00Z');
  const future = '2026-11-01T00:00:00Z', past = '2026-09-01T00:00:00Z';
  it('classifies', () => {
    expect(subscriptionState({ whitelisted: true }, true, now)).toBe('whitelisted');
    expect(subscriptionState({ paid_until: future, card_subscription_id: 'sub_1' }, true, now)).toBe('active_card');
    expect(subscriptionState({ paid_until: future }, true, now)).toBe('active_crypto');
    expect(subscriptionState({ trial_ends_at: future }, true, now)).toBe('trial');
    expect(subscriptionState({ trial_ends_at: past, paid_until: past }, true, now)).toBe('lapsed');
    expect(subscriptionState({ card_status: 'past_due', paid_until: future }, true, now)).toBe('card_past_due');
    expect(subscriptionState({ whitelisted: true }, false, now)).toBe('bot_removed');
  });
  it('parses the maintenance flag shapes', () => {
    expect([parseFlag(true), parseFlag('true'), parseFlag({ enabled: true }), parseFlag(null), parseFlag('no')]).toEqual([true, true, true, false, false]);
  });
  it('builds Polar links only from safe ids', () => {
    expect(polarLink('sub_abc123', 'acme')).toBe('https://polar.sh/dashboard/acme/sales/subscriptions/sub_abc123');
    expect(polarLink('../evil', 'acme')).toBeNull();
    expect(polarLink(null, 'acme')).toBeNull();
  });
});

describe('output safety', () => {
  it('neutralises CSV formulas', () => {
    expect(toCsv([{ a: '=1+1', b: 'x,"y"' }])).toBe(`a,b\r\n'=1+1,"x,""y"""\r\n`);
  });
  it('masks emails and escapes LIKE terms', () => {
    expect(maskEmail('jane@example.com')).toBe('j***@example.com');
    expect(likeTerm('a%b_c,d')).toBe('a\\%b\\_c\\,d');
  });
});

describe('design tokens', () => {
  const css = readFileSync('src/app/globals.css', 'utf8');
  it('pass WCAG AA (4.5:1) in both themes', () => {
    expect(failures(css).bad).toEqual([]);
  });
  it('never use pure white or black as a page colour', () => {
    const { themes } = failures(css);
    for (const t of Object.values(themes)) for (const k of ['canvas', 'surface', 'raised', 'ink'])
      expect(['#ffffff', '#000000']).not.toContain(t[k]!.toLowerCase());
  });
  it('keeps the OS-dark block identical to the manual dark block', () => {
    const media = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\[data-theme='system'\]\s*\{([^}]*)\}/)![1]!;
    const manual = css.match(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/)![1]!;
    const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
    expect(norm(media)).toBe(norm(manual));
  });
});

describe('migration', () => {
  const sql = readFileSync('supabase/migrations/20261017000000_hub_schema.sql', 'utf8');
  it('enables RLS on every hub table and keeps the audit log append-only', () => {
    const tables = [...sql.matchAll(/create table if not exists duolplus_admin\.(\w+)/g)].map((m) => m[1]);
    expect(tables.length).toBe(6);
    for (const t of tables) expect(sql).toContain(`alter table duolplus_admin.${t} enable row level security`);
    expect(sql).toContain('grant select, insert on duolplus_admin.hub_audit_log to service_role');
    expect(sql).toMatch(/hub_audit_no_update before update or delete/);
  });
  it('has no support/viewer roles', () => {
    expect(sql).not.toMatch(/support|viewer/);
  });
});
