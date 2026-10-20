import 'server-only';
import { z } from 'zod';

/** An empty `NAME=` line in a host's env settings counts as not set. */
const blankToUndefined = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === '' ? undefined : v), t);

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  HUB_URL: z.url(),
  SESSION_SECRET: z.string().min(32),
  INITIAL_OWNER_EMAIL: z.string().optional(),
  POLAR_DASHBOARD_ORG_SLUG: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  POLAR_ACCESS_TOKEN: blankToUndefined(z.string().optional()),
  POLAR_ENV: blankToUndefined(z.enum(['production', 'sandbox']).optional()),
  TEST_GUILD_IDS: blankToUndefined(z.string().optional()),
  WFC_API_KEY: blankToUndefined(z.string().optional()),
  WFC_API_BASE: blankToUndefined(z.url().optional()),
  WFC_POLAR_ORG_SLUG: blankToUndefined(z.string().optional()),
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
    cached = parsed.data;
  }
  return cached;
}
