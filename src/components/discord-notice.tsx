import { AlertTriangle } from 'lucide-react';
import { discordStatus } from '@/lib/discord';

const TEXT = {
  missing: 'Server names and icons are off. Add DISCORD_BOT_TOKEN to your .env file and restart the app.',
  invalid: 'Discord rejected the bot token (401), so server names and icons cannot load. In the Discord Developer Portal open your app, go to Bot, choose Reset Token, put the new token in DISCORD_BOT_TOKEN and restart the app.',
  unreachable: 'Could not reach Discord just now, so server names and icons are not shown. Check your connection and reload.',
} as const;

/** Explains why names/icons are missing; renders nothing when Discord lookups work. */
export async function DiscordNotice() {
  const status = await discordStatus();
  if (status === 'ok') return null;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl bg-warning-soft px-4 py-3 text-warning" role="status">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{TEXT[status]}</span>
    </div>
  );
}
