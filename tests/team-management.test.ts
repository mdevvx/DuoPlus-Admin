import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// env() validates the whole panel environment, so give it harmless values before the client is imported.
const KEY = 'super-secret-admin-key-123';
beforeAll(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(30), SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(30),
    HUB_URL: 'http://localhost:3000', SESSION_SECRET: 'x'.repeat(40), DUOPLUS_API_URL: 'https://api.tms.test', DUOPLUS_ADMIN_KEY: KEY,
  });
});
afterEach(() => vi.unstubAllGlobals());

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('operator API client', () => {
  it('builds the admin base from the domain, with or without the path', async () => {
    const { adminBase } = await import('@/products/team-management/api');
    expect(adminBase('https://api.x.com')).toBe('https://api.x.com/api/v1/admin');
    expect(adminBase('https://api.x.com/')).toBe('https://api.x.com/api/v1/admin');
    expect(adminBase('https://api.x.com/api/v1')).toBe('https://api.x.com/api/v1/admin');
    expect(adminBase('https://api.x.com/api/v1/admin/')).toBe('https://api.x.com/api/v1/admin');
  });

  it('reads the overview from the spec sample and sends the key as a header', async () => {
    const { getOverview } = await import('@/products/team-management/api');
    const fetchMock = reply({
      generatedAt: '2026-10-28T12:00:00.000Z', users: { total: 120, new30d: 18 }, workspaces: { total: 64, new30d: 11 },
      subscriptions: { byStatus: { active: 20, trialing: 6, incomplete: 30, comped: 8 }, byPlan: { starter: 40, growth: 18, scale: 6 }, whitelisted: 3 },
      billing: { payingAccounts: 20, trialingAccounts: 6, trialsEndingIn3Days: 2, mrrCents: 298000 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const o = await getOverview();
    expect(o.billing.mrrCents).toBe(298000);
    expect(o.subscriptions.byPlan.growth).toBe(18);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.tms.test/api/v1/admin/overview');
    expect((init.headers as Record<string, string>)['x-admin-key']).toBe(KEY);
  });

  it('keeps rendering when the API sends unexpected values', async () => {
    const { listWorkspaces } = await import('@/products/team-management/api');
    vi.stubGlobal('fetch', reply({ page: 1, pageSize: 25, total: 1, items: [{ id: 'w1', name: null, status: 'brand_new', plan: 'enterprise', members: '12', seatLimit: 50, owner: null, logoUrl: 5 }] }));
    const r = await listWorkspaces({ page: 1, pageSize: 25 });
    expect(r.items[0]).toMatchObject({ id: 'w1', name: 'Untitled workspace', status: 'brand_new', plan: 'enterprise', members: 12, owner: null, logoUrl: null, whitelisted: false });
  });

  it('sends add and remove requests correctly', async () => {
    const { addWhitelist, removeWhitelist } = await import('@/products/team-management/api');
    const add = reply({ email: 'friend@example.com', plan: 'scale', workspaces: 1, activeSubscription: true }, 201);
    vi.stubGlobal('fetch', add);
    const res = await addWhitelist({ email: 'friend@example.com', plan: 'scale', note: 'Partner' });
    expect(res).toEqual({ email: 'friend@example.com', plan: 'scale', workspaces: 1, activeSubscription: true });
    expect(JSON.parse((add.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ email: 'friend@example.com', plan: 'scale', note: 'Partner' });

    const del = reply(null, 204);
    vi.stubGlobal('fetch', del);
    await removeWhitelist('a+b@example.com');
    expect((del.mock.calls[0] as unknown as [string])[0]).toBe('https://api.tms.test/api/v1/admin/whitelist/a%2Bb%40example.com');
  });

  it('maps failures to clear errors and never leaks the key', async () => {
    const { getOverview, removeWhitelist, TmsError, describe: explain } = await import('@/products/team-management/api');
    vi.stubGlobal('fetch', reply({ error: { message: 'bad key', code: 'unauthorized' } }, 401));
    const err = await getOverview().catch((e) => e);
    expect(err).toBeInstanceOf(TmsError);
    expect(err.status).toBe(401);
    expect(explain(err)).toContain('rejected the admin key');
    expect(JSON.stringify(err) + err.message + explain(err)).not.toContain(KEY);

    vi.stubGlobal('fetch', reply({ error: { message: 'Not on the list', code: 'not_found' } }, 404));
    await expect(removeWhitelist('x@y.com')).rejects.toMatchObject({ status: 404, code: 'not_found' });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error(`connect ECONNREFUSED with key ${KEY}`); }));
    const down = await getOverview().catch((e) => e);
    expect(down.code).toBe('unreachable');
    expect(down.message).not.toContain(KEY);
  });
});

describe('labels', () => {
  it('colours statuses as specified and handles unknown ones', async () => {
    const { statusTone, statusLabel, humanize } = await import('@/products/team-management/labels');
    expect(statusTone('active')).toBe('success');
    expect(statusTone('trialing')).toBe('info');
    expect(statusTone('comped')).toBe('neutral');
    expect(statusTone('past_due')).toBe('warning');
    expect(statusTone('canceled')).toBe('danger');
    expect(statusTone('unpaid')).toBe('danger');
    expect(statusTone('something_new')).toBe('neutral');
    expect(statusLabel('past_due')).toBe('Past due');
    expect(humanize('something_new')).toBe('Something new');
  });
  it('validates emails the way the add form does', async () => {
    const { EMAIL_RE } = await import('@/products/team-management/labels');
    expect(EMAIL_RE.test('friend@example.com')).toBe(true);
    expect(EMAIL_RE.test('@example.com')).toBe(false);
    expect(EMAIL_RE.test('*@example.com ')).toBe(false);
    expect(EMAIL_RE.test('example.com')).toBe(false);
  });
});

describe('payments from Polar orders', () => {
  const order = (o: Record<string, unknown> = {}) => ({
    id: 'ord_1', created_at: '2026-10-20T10:00:00Z', status: 'paid', total_amount: 14900, refunded_amount: 0, currency: 'usd', billing_reason: 'subscription_cycle',
    product_id: 'prod_growth', product: { id: 'prod_growth', name: 'Growth' }, subscription_id: 'sub_1', invoice_number: 'INV-1',
    customer: { id: 'cus_1', email: 'ada@acme.com', name: 'Ada', external_id: 'user-uuid' }, ...o,
  });

  it('reads an order and recognises the plan from its product name', async () => {
    const { parseOrder, planOf } = await import('@/products/team-management/payments');
    const r = parseOrder(order())!;
    expect(r).toMatchObject({ id: 'ord_1', status: 'paid', amount: 14900, plan: 'growth', email: 'ada@acme.com', externalId: 'user-uuid', reason: 'subscription_cycle' });
    expect(planOf('Starter plan (monthly)')).toBe('starter');
    expect(planOf('Scale')).toBe('scale');
    expect(planOf('DiscoNotify Pro')).toBeNull();
    expect(planOf('Scalable widgets')).toBeNull();
  });

  it('survives missing and odd fields', async () => {
    const { parseOrder, parseOrders } = await import('@/products/team-management/payments');
    expect(parseOrder({})).toBeNull();
    expect(parseOrder(null)).toBeNull();
    const r = parseOrder({ id: 'x', amount: '4900', paid: true, customer: null })!;
    expect(r).toMatchObject({ id: 'x', amount: 4900, status: 'paid', email: '', plan: null, currency: 'usd' });
    expect(parseOrders({ items: [order(), { nope: 1 }], pagination: { max_page: 3 } })).toMatchObject({ maxPage: 3, rows: [{ id: 'ord_1' }] });
    expect(parseOrders([order()]).rows).toHaveLength(1);
    expect(parseOrders('garbage').rows).toEqual([]);
  });

  it('filters and totals', async () => {
    const { parseOrder, filterPayments, totals, filtersFromParams } = await import('@/products/team-management/payments');
    const rows = [
      parseOrder(order())!,
      parseOrder(order({ id: 'ord_2', created_at: '2026-10-25T10:00:00Z', total_amount: 4900, product: { name: 'Starter' }, customer: { email: 'bob@beta.io', name: 'Bob' } }))!,
      parseOrder(order({ id: 'ord_3', created_at: '2026-10-26T10:00:00Z', status: 'refunded', total_amount: 24900, refunded_amount: 24900, product: { name: 'Scale' } }))!,
      parseOrder(order({ id: 'ord_4', status: 'pending', total_amount: 4900 }))!,
    ];
    expect(filterPayments(rows, { q: 'BOB' }).map((r) => r.id)).toEqual(['ord_2']);
    expect(filterPayments(rows, { plan: ['scale'] }).map((r) => r.id)).toEqual(['ord_3']);
    expect(filterPayments(rows, { status: ['paid'] }).map((r) => r.id)).toEqual(['ord_1', 'ord_2']);
    expect(filterPayments(rows, { from: '2026-10-25', to: '2026-10-25' }).map((r) => r.id)).toEqual(['ord_2']);
    expect(filterPayments(rows, { min: 100 }).map((r) => r.id)).toEqual(['ord_1', 'ord_3']);
    // pending orders are not revenue; a refund reduces the net
    expect(totals(rows)).toEqual({ gross: 14900 + 4900 + 24900, refunded: 24900, net: 14900 + 4900, orders: 3 });
    expect(filtersFromParams({ plan: 'growth,bogus', status: 'paid,x', from: 'bad', min: '5', max: '-1' })).toMatchObject({ plan: ['growth'], status: ['paid'], from: undefined, min: 5, max: undefined });
  });
});
