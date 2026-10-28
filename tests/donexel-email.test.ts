import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const KEY = 'donexel-secret-key-456';
beforeAll(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(30), SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(30),
    HUB_URL: 'http://localhost:3000', SESSION_SECRET: 'x'.repeat(40), DONEXEL_API_URL: 'https://api.donexel.test', DONEXEL_ADMIN_KEY: KEY,
  });
});
afterEach(() => vi.unstubAllGlobals());

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const call = (f: ReturnType<typeof vi.fn>, i = 0) => f.mock.calls[i] as unknown as [string, RequestInit];

describe('Donexel email API client', () => {
  it('reads overview and reminders', async () => {
    const { emailOverview, emailReminders } = await import('@/products/team-management/email-api');
    const f = reply({ configured: true, from: 'Donexel <no-reply@donexel.com>', remindersEnabled: true, last30d: { total: 40, sent: 36, failed: 2, skipped: 2 } });
    vi.stubGlobal('fetch', f);
    expect(await emailOverview()).toMatchObject({ configured: true, remindersEnabled: true, last30d: { sent: 36, failed: 2 } });
    expect(call(f)[0]).toBe('https://api.donexel.test/api/v1/admin/email/overview');
    expect((call(f)[1].headers as Record<string, string>)['x-admin-key']).toBe(KEY);

    vi.stubGlobal('fetch', reply({ enabled: false, rules: [{ key: 'trial_ending', name: 'Trial ending', trigger: '3 days and 1 day before', enabled: true, sentLast30d: 7 }, { key: 'x' }] }));
    const r = await emailReminders();
    expect(r.enabled).toBe(false);
    expect(r.rules[0]).toMatchObject({ key: 'trial_ending', sentLast30d: 7 });
    expect(r.rules[1]).toMatchObject({ key: 'x', name: '', enabled: false, sentLast30d: 0 });
  });

  it('reads templates and saves one with PUT', async () => {
    const { listEmailTemplates, saveEmailTemplate } = await import('@/products/team-management/email-api');
    const t = { key: 'payment_failed', name: 'Payment failed', category: 'billing', trigger: 'A card payment fails', variables: ['name', 'amount'], hasLink: true, sensitive: false, enabled: true, customized: true,
      subject: 'S', heading: 'H', body: 'B', buttonLabel: 'Update card', defaults: { subject: 'S0', heading: 'H0', body: 'B0', buttonLabel: 'L0' } };
    vi.stubGlobal('fetch', reply([t, { key: 'odd', category: 7, enabled: 'maybe' }]));
    const list = await listEmailTemplates();
    expect(list[0]).toMatchObject({ key: 'payment_failed', variables: ['name', 'amount'], hasLink: true, defaults: { subject: 'S0' } });
    expect(list[1]).toMatchObject({ key: 'odd', category: '', enabled: true, variables: [] });

    const f = reply(t);
    vi.stubGlobal('fetch', f);
    await saveEmailTemplate('payment_failed', { subject: 'New', heading: 'Hi', body: 'Text', buttonLabel: 'Go', enabled: false });
    expect(call(f)[1].method).toBe('PUT');
    expect(call(f)[0]).toBe('https://api.donexel.test/api/v1/admin/email/templates/payment_failed');
    expect(JSON.parse(call(f)[1].body as string)).toEqual({ subject: 'New', heading: 'Hi', body: 'Text', buttonLabel: 'Go', enabled: false });
  });

  it('previews, resets and tests templates', async () => {
    const { previewEmailTemplate, resetEmailTemplate, testEmailTemplate } = await import('@/products/team-management/email-api');
    const p = reply({ subject: 'Sub', text: 'Plain', html: '<p>Hi</p>' });
    vi.stubGlobal('fetch', p);
    expect(await previewEmailTemplate('welcome', { heading: 'Draft' })).toEqual({ subject: 'Sub', text: 'Plain', html: '<p>Hi</p>' });
    expect(call(p)[0]).toMatch(/\/email\/templates\/welcome\/preview$/);

    const d = reply(null, 204);
    vi.stubGlobal('fetch', d);
    await resetEmailTemplate('welcome');
    expect(call(d)[1].method).toBe('DELETE');

    const t = reply({}, 200);
    vi.stubGlobal('fetch', t);
    await testEmailTemplate('welcome', 'me@x.com', 'admin@panel.com');
    expect(JSON.parse(call(t)[1].body as string)).toEqual({ to: 'me@x.com', sentBy: 'admin@panel.com' });
  });

  it('sends with sentBy and keeps the 502 details', async () => {
    const { sendEmail } = await import('@/products/team-management/email-api');
    const ok = reply({ results: [{ to: 'a@x.com', status: 'sent', error: null, id: 'e1' }, { to: 'b@x.com', status: 'failed', error: 'Mailbox full', id: null }], sent: 1, failed: 1 }, 201);
    vi.stubGlobal('fetch', ok);
    const r = await sendEmail({ to: ['a@x.com', 'b@x.com'], subject: 'Hi', body: 'Hello {{name}}', button: { label: 'Open', url: 'https://x.com' }, sentBy: 'admin@panel.com' });
    expect(r).toMatchObject({ sent: 1, failed: 1 });
    expect(r.results[1]).toMatchObject({ to: 'b@x.com', status: 'failed', error: 'Mailbox full' });
    expect(JSON.parse(call(ok)[1].body as string)).toMatchObject({ sentBy: 'admin@panel.com', to: ['a@x.com', 'b@x.com'] });

    const { TmsError } = await import('@/products/team-management/api');
    vi.stubGlobal('fetch', reply({ status: 'failed', error: 'SMTP login refused' }, 502));
    const err = await sendEmail({ to: ['a@x.com'], subject: 's', body: 'b', sentBy: 'a@b.c' }).catch((e) => e);
    expect(err).toBeInstanceOf(TmsError);
    expect(err.status).toBe(502);
    expect((err.body as { error: string }).error).toBe('SMTP login refused');
  });

  it('lists the outbox with filters and opens one item', async () => {
    const { listOutbox, getOutboxItem, resendOutboxItem } = await import('@/products/team-management/email-api');
    const item = { id: 'm1', templateKey: null, source: 'manual', to: 'a@x.com', toName: null, userId: null, subject: 'Hi', status: 'failed', error: 'Mailbox full', sentBy: 'admin@panel.com', createdAt: '2026-10-28T10:00:00Z' };
    const f = reply({ page: 1, pageSize: 25, total: 1, items: [item] });
    vi.stubGlobal('fetch', f);
    const r = await listOutbox({ status: 'failed', source: 'manual', template: 'welcome', search: 'a@x.com', page: 2, pageSize: 25 });
    expect(r.items[0]).toMatchObject({ id: 'm1', status: 'failed', templateKey: null, error: 'Mailbox full' });
    const url = new URL(call(f)[0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: '2', pageSize: '25', status: 'failed', source: 'manual', template: 'welcome', search: 'a@x.com' });

    vi.stubGlobal('fetch', reply({ ...item, body: 'Text', canResend: true }));
    expect(await getOutboxItem('m1')).toMatchObject({ body: 'Text', canResend: true });

    const rs = reply({}, 201);
    vi.stubGlobal('fetch', rs);
    await resendOutboxItem('m1', 'admin@panel.com');
    expect(call(rs)[0]).toMatch(/\/email\/outbox\/m1\/resend$/);
  });

  it('reads contacts and updates opt-out and reset with encoded paths', async () => {
    const { listEmailContacts, setContactOptOut, sendPasswordReset, getEmailSettings, saveEmailSettings } = await import('@/products/team-management/email-api');
    vi.stubGlobal('fetch', reply({ page: 1, pageSize: 25, total: 1, items: [{ id: 'c1', email: 'a+b@x.com', fullName: 'Ada', createdAt: '2026-10-01T00:00:00Z', remindersOptedOut: true, lastEmailAt: null }] }));
    const c = await listEmailContacts({ search: 'a', page: 1, pageSize: 25 });
    expect(c.items[0]).toMatchObject({ email: 'a+b@x.com', remindersOptedOut: true, lastEmailAt: null });

    const o = reply(null, 204);
    vi.stubGlobal('fetch', o);
    await setContactOptOut('a+b@x.com', true);
    expect(call(o)[0]).toBe('https://api.donexel.test/api/v1/admin/email/contacts/a%2Bb%40x.com/optout');
    expect(call(o)[1].method).toBe('PUT');
    expect(JSON.parse(call(o)[1].body as string)).toEqual({ optedOut: true });

    const pr = reply(null, 204);
    vi.stubGlobal('fetch', pr);
    await sendPasswordReset('c1');
    expect(call(pr)[0]).toMatch(/\/email\/contacts\/c1\/password-reset$/);

    vi.stubGlobal('fetch', reply({ fromName: 'Donexel', replyTo: '', footer: 'Bye', remindersEnabled: true, senderAddress: 'no-reply@donexel.com', configured: true }));
    expect(await getEmailSettings()).toMatchObject({ fromName: 'Donexel', senderAddress: 'no-reply@donexel.com', configured: true });
    const s = reply(null, 204);
    vi.stubGlobal('fetch', s);
    await saveEmailSettings({ fromName: 'D', replyTo: '', footer: 'x', remindersEnabled: false });
    expect(call(s)[1].method).toBe('PUT');
  });

  it('explains Railway’s "Application not found" instead of a generic error', async () => {
    const { getOverview, describe: explain } = await import('@/products/team-management/api');
    vi.stubGlobal('fetch', reply({ status: 'error', code: 404, message: 'Application not found', request_id: 'abc' }, 404));
    const e = await getOverview().catch((x) => x);
    expect(e.status).toBe(404);
    expect(explain(e)).toContain('Application not found');
    expect(explain(e)).toContain('DONEXEL_API_URL');
    expect(JSON.stringify(e) + explain(e)).not.toContain(KEY);
  });
});

describe('compose helpers', () => {
  it('parses recipients from pasted text', async () => {
    const { parseRecipients } = await import('@/products/team-management/email-compose');
    expect(parseRecipients('A@x.com, b@y.com;  a@x.com\nnot-an-email  c@z.io')).toEqual({ valid: ['a@x.com', 'b@y.com', 'c@z.io'], invalid: ['not-an-email'] });
    expect(parseRecipients('')).toEqual({ valid: [], invalid: [] });
  });

  it('builds an escaped, approximate preview', async () => {
    const { composePreview } = await import('@/products/team-management/email-compose');
    const html = composePreview({ heading: 'Hi <b>{{name}}</b>', body: 'Line one\nstill one\n\nSecond <script>alert(1)</script>', button: { label: 'Go "now"', url: 'https://x.com/a?b=1&c=2' } });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Hi &lt;b&gt;Alex&lt;/b&gt;');
    expect(html).toContain('Line one<br>still one');
    expect(html).toContain('href="https://x.com/a?b=1&amp;c=2"');
    expect(composePreview({ body: '', button: { label: 'Go', url: 'javascript:alert(1)' } })).toContain('href="#"');
  });
});
