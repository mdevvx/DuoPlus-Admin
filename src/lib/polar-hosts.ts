/**
 * The only place that knows Polar's addresses. Live and sandbox are separate Polar worlds (own accounts, tokens,
 * products and customers), so everything that talks to Polar or links to it derives its address from here.
 * Pure on purpose: no environment access, so server pages, state helpers and tests can all use it.
 */
export const POLAR_LIVE_API = 'https://api.polar.sh/v1';
export const POLAR_SANDBOX_API = 'https://sandbox-api.polar.sh/v1';
const LIVE_DASHBOARD = 'https://polar.sh';
const SANDBOX_DASHBOARD = 'https://sandbox.polar.sh';

export const polarApiBase = (sandbox: boolean) => (sandbox ? POLAR_SANDBOX_API : POLAR_LIVE_API);
export const polarDashboardHost = (sandbox: boolean) => (sandbox ? SANDBOX_DASHBOARD : LIVE_DASHBOARD);
export const polarModeName = (sandbox: boolean) => (sandbox ? 'Sandbox' : 'Live');

/** A dashboard link for an organisation slug; the plain dashboard when the slug is missing or not a safe slug. */
export function polarDashboardUrl(sandbox: boolean, orgSlug?: string | null, path = ''): string {
  const host = polarDashboardHost(sandbox);
  return orgSlug && /^[\w-]+$/.test(orgSlug) ? `${host}/dashboard/${orgSlug}${path}` : `${host}/dashboard`;
}

/** `DISCONOTIFY_POLAR_SANDBOX` ("true" / "false", set to the bot's own POLAR_SANDBOX value) wins; the older `DISCONOTIFY_POLAR_ENV=sandbox` still works. */
export function sandboxFromSettings(flag: string | undefined, legacyEnv?: string): boolean {
  if (flag !== undefined && flag !== '') return flag.trim().toLowerCase() === 'true';
  return legacyEnv === 'sandbox';
}
