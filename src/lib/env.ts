import 'server-only';
import { z } from 'zod';

/** An empty `NAME=` line in a host's env settings counts as not set. */
const blankToUndefined = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === '' ? undefined : v), t);

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  HUB_URL: z.url(),
  /** Optional public https image for the email logo (for example on the website). Overrides the panel's own logo route. */
  EMAIL_LOGO_URL: blankToUndefined(z.url().refine((u) => u.startsWith('https://'), 'must be https').optional()),
  SESSION_SECRET: z.string().min(32),
  INITIAL_OWNER_EMAIL: z.string().optional(),
  DISCONOTIFY_POLAR_ORG_SLUG: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCONOTIFY_POLAR_ACCESS_TOKEN: blankToUndefined(z.string().optional()),
  // Same switch as the bot: "true" = Polar sandbox, "false" or unset = live. DISCONOTIFY_POLAR_ENV is the older name and still works.
  DISCONOTIFY_POLAR_SANDBOX: blankToUndefined(z.enum(['true', 'false']).optional()),
  DISCONOTIFY_POLAR_ENV: blankToUndefined(z.enum(['production', 'sandbox']).optional()),
  WFC_API_KEY: blankToUndefined(z.string().optional()),
  WFC_API_BASE: blankToUndefined(z.url().optional()),
  WFC_POLAR_ORG_SLUG: blankToUndefined(z.string().optional()),
  // Donexel (the app formerly called DuoPlus) operator API. SERVER ONLY. The DUOPLUS_* names still work as a fallback.
  DONEXEL_API_URL: blankToUndefined(z.url().optional()),
  DONEXEL_ADMIN_KEY: blankToUndefined(z.string().min(8).optional()),
  DUOPLUS_API_URL: blankToUndefined(z.url().optional()),
  DUOPLUS_ADMIN_KEY: blankToUndefined(z.string().min(8).optional()),
  // Which Polar Donexel uses, so dashboard links never mix sandbox and live. Defaults to production.
  DONEXEL_POLAR_ENV: blankToUndefined(z.enum(['production', 'sandbox']).optional()),
  DONEXEL_POLAR_ORG_SLUG: blankToUndefined(z.string().optional()),
  // Polar token for reading Donexel's orders (needs order read access), from the same environment as DONEXEL_POLAR_ENV.
  DONEXEL_POLAR_ACCESS_TOKEN: blankToUndefined(z.string().optional()),
  // Optional comma-separated Polar product IDs of the Starter, Growth and Scale products. Without them plans are matched by name.
  DONEXEL_POLAR_PRODUCT_IDS: blankToUndefined(z.string().optional()),
  // The earlier unprefixed POLAR_* names (DiscoNotify's Polar) still work as a fallback.
  POLAR_DASHBOARD_ORG_SLUG: z.string().optional(),
  POLAR_ACCESS_TOKEN: blankToUndefined(z.string().optional()),
  POLAR_SANDBOX: blankToUndefined(z.enum(['true', 'false']).optional()),
  POLAR_ENV: blankToUndefined(z.enum(['production', 'sandbox']).optional()),
  // The earlier TMS_POLAR_* names (Donexel's Polar) still work as a fallback.
  TMS_POLAR_ENV: blankToUndefined(z.enum(['production', 'sandbox']).optional()),
  TMS_POLAR_ORG_SLUG: blankToUndefined(z.string().optional()),
  TMS_POLAR_ACCESS_TOKEN: blankToUndefined(z.string().optional()),
  TMS_POLAR_PRODUCT_IDS: blankToUndefined(z.string().optional()),
});

let cached: z.infer<typeof schema> | undefined;

/** Validated server env. Throws a readable error on first use if something is missing. */
export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
      throw new Error(`Invalid or missing environment variables: ${keys}`);
    }
    const d = parsed.data;
    cached = {
      ...d,
      DISCONOTIFY_POLAR_ORG_SLUG: d.DISCONOTIFY_POLAR_ORG_SLUG ?? d.POLAR_DASHBOARD_ORG_SLUG,
      DISCONOTIFY_POLAR_ACCESS_TOKEN: d.DISCONOTIFY_POLAR_ACCESS_TOKEN ?? d.POLAR_ACCESS_TOKEN,
      DISCONOTIFY_POLAR_SANDBOX: d.DISCONOTIFY_POLAR_SANDBOX ?? d.POLAR_SANDBOX,
      DISCONOTIFY_POLAR_ENV: d.DISCONOTIFY_POLAR_ENV ?? d.POLAR_ENV,
      DONEXEL_POLAR_ENV: d.DONEXEL_POLAR_ENV ?? d.TMS_POLAR_ENV,
      DONEXEL_POLAR_ORG_SLUG: d.DONEXEL_POLAR_ORG_SLUG ?? d.TMS_POLAR_ORG_SLUG,
      DONEXEL_POLAR_ACCESS_TOKEN: d.DONEXEL_POLAR_ACCESS_TOKEN ?? d.TMS_POLAR_ACCESS_TOKEN,
      DONEXEL_POLAR_PRODUCT_IDS: d.DONEXEL_POLAR_PRODUCT_IDS ?? d.TMS_POLAR_PRODUCT_IDS,
    };
  }
  return cached;
}
