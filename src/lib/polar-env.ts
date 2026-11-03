import 'server-only';
import { env } from './env';
import { sandboxFromSettings } from './polar-hosts';

/**
 * Which Polar the panel follows. `bot` is the DiscoNotify bot's Polar (DISCONOTIFY_POLAR_SANDBOX, which must equal the bot's own POLAR_SANDBOX; DISCONOTIFY_POLAR_ENV is the older
 * name), `donexel` is the Donexel app's own (DONEXEL_POLAR_ENV). The two products can run in different environments.
 */
export function polarSandbox(scope: 'bot' | 'donexel' = 'bot'): boolean {
  const e = env();
  return scope === 'donexel' ? e.DONEXEL_POLAR_ENV === 'sandbox' : sandboxFromSettings(e.DISCONOTIFY_POLAR_SANDBOX, e.DISCONOTIFY_POLAR_ENV);
}
