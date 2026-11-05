import { z } from 'zod';

/**
 * Bot settings editable from the panel. Stored as JSON under notify_bot_state key "bot_settings".
 * A field that is missing means "use the bot's own default (its environment variable)".
 */
export const botSettingsSchema = z.strictObject({
  price_usd: z.number().min(0.5, 'The price must be at least $0.50').max(999, 'The price must be at most $999').optional(),
  grace_days: z.number().int('Grace days must be a whole number').min(0).max(60, 'Grace days can be at most 60').optional(),
});
export type BotSettings = z.infer<typeof botSettingsSchema>;

export const BOT_SETTING_FIELDS: { key: keyof BotSettings; label: string; hint: string; format: (n: number) => string }[] = [
  { key: 'price_usd', label: 'Price per server (USD per month)', hint: 'For example 1.99', format: (n) => `$${n.toFixed(2)}` },
  { key: 'grace_days', label: 'Grace period after expiry (days)', hint: '0 to 60', format: (n) => `${n} days` },
];

/** Form text → settings. An empty box removes the field so the bot falls back to its own default. */
export function parseBotSettingsForm(get: (key: string) => string): BotSettings {
  const num = (key: string) => {
    const raw = get(key).trim();
    if (raw === '') return undefined;
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error(`${key}: enter a plain number`);
    return Number(raw);
  };
  return botSettingsSchema.parse({ price_usd: num('price_usd'), grace_days: num('grace_days') });
}
