// End to end: login -> switch product -> whitelist a server -> see it in the audit log.
// Needs a TEST Supabase project with the migration applied and an auth user for E2E_EMAIL, plus:
//   E2E_EMAIL, E2E_PASSWORD,
//   E2E_TOTP_SECRET (the authenticator secret of the test owner), E2E_SERVER_NAME (a test server).
import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';

function totp(secretBase32: string, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretBase32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}

const env = (k: string) => { const v = process.env[k]; test.skip(!v, `${k} not set`); return v!; };

test('unknown email and wrong password get the same message', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name=email]', 'nobody-' + Date.now() + '@example.com');
  await page.fill('input[name=password]', 'wrong-password-123');
  await page.click('button:has-text("Sign in")');
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
});

test('login, switch product, whitelist, audit', async ({ page }) => {
  const email = env('E2E_EMAIL'), secret = env('E2E_TOTP_SECRET'), server = env('E2E_SERVER_NAME');
  const password = env('E2E_PASSWORD');

  await page.goto('/login');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('**/mfa');
  await page.fill('input[name=code]', totp(secret));
  await page.click('button:has-text("Verify")');
  await page.waitForURL('/');

  await page.getByRole('button', { name: /DuoPlus Admin|Switch product/ }).first().click();
  await page.getByRole('button', { name: /DiscoNotify/ }).click();
  await page.getByRole('link', { name: 'Servers' }).click();
  await page.fill('input[name=q]', server);
  await page.click('button:has-text("Apply")');
  await page.getByRole('link', { name: server }).first().click();

  await page.getByRole('button', { name: 'Whitelist', exact: true }).click();
  await page.fill('textarea[name=reason]', 'e2e test whitelist');
  await page.fill('input[name=confirm]', server);
  await page.click('dialog button:has-text("Confirm")');
  await expect(page.getByText('Server whitelisted')).toBeVisible();

  await page.goto('/audit?action=server.whitelist');
  await expect(page.getByText('server.whitelist').first()).toBeVisible();
});
