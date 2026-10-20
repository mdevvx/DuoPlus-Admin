import 'server-only';
import { unstable_cache } from 'next/cache';

export interface GuildInfo { name: string; iconUrl: string | null }
export type DiscordStatus = 'ok' | 'missing' | 'invalid' | 'unreachable';

const SIX_HOURS = 6 * 60 * 60;
const API = 'https://discord.com/api/v10';

class Transient extends Error {}

// After Discord rejects the token we stop calling it for a minute instead of failing 50 times per page.
let rejectedUntil = 0;
// Servers the bot is not in (404/403) are remembered briefly in memory, never in the persistent cache.
const misses = new Map<string, number>();

const authHeader = () => ({ Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` });

/** One Discord REST call. Only successful lookups are cached; 401, 429 and 5xx throw so they never stick. */
async function fetchGuild(id: string): Promise<GuildInfo> {
  const res = await fetch(`${API}/guilds/${id}`, { headers: authHeader(), cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (res.status === 401) { rejectedUntil = Date.now() + 60_000; throw new Transient('token rejected'); }
  if (res.status === 404 || res.status === 403) { misses.set(id, Date.now() + 10 * 60_000); throw new Transient('not in server'); }
  if (!res.ok) throw new Transient(`discord ${res.status}`);
  const g = (await res.json()) as { name?: string; icon?: string | null };
  if (!g.name) throw new Transient('no name');
  const ext = g.icon?.startsWith('a_') ? 'gif' : 'png';
  return { name: g.name, iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${id}/${g.icon}.${ext}?size=64` : null };
}

const cached = unstable_cache(async (id: string) => fetchGuild(id), ['discord-guild'], { revalidate: SIX_HOURS });

export async function getGuildInfo(id: string): Promise<GuildInfo | null> {
  if (!/^\d{5,25}$/.test(id) || !process.env.DISCORD_BOT_TOKEN) return null;
  if (Date.now() < rejectedUntil || (misses.get(id) ?? 0) > Date.now()) return null;
  try {
    return await cached(id);
  } catch {
    return null;
  }
}

/** Names and icons for many servers, with limited concurrency to stay well under Discord's rate limits. */
export async function guildInfoMap(ids: string[]): Promise<Record<string, GuildInfo | null>> {
  const unique = [...new Set(ids)];
  const out: Record<string, GuildInfo | null> = {};
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, unique.length) }, async () => {
    while (next < unique.length) {
      const id = unique[next++]!;
      out[id] = await getGuildInfo(id);
    }
  }));
  return out;
}

export interface UserInfo { name: string; avatarUrl: string | null }

async function fetchUser(id: string): Promise<UserInfo> {
  const res = await fetch(`${API}/users/${id}`, { headers: authHeader(), cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (res.status === 401) { rejectedUntil = Date.now() + 60_000; throw new Transient('token rejected'); }
  if (!res.ok) throw new Transient(`discord ${res.status}`);
  const u = (await res.json()) as { username?: string; global_name?: string | null; avatar?: string | null };
  const name = u.global_name || u.username;
  if (!name) throw new Transient('no name');
  return { name, avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.png?size=64` : null };
}
const cachedUser = unstable_cache(async (id: string) => fetchUser(id), ['discord-user'], { revalidate: SIX_HOURS });

/** Display names for Discord users the bot has seen. Failures just return null; the panel falls back to the ID. */
export async function userInfoMap(ids: string[]): Promise<Record<string, UserInfo | null>> {
  const unique = [...new Set(ids)].filter((id) => /^\d{5,25}$/.test(id));
  const out: Record<string, UserInfo | null> = {};
  if (!process.env.DISCORD_BOT_TOKEN || Date.now() < rejectedUntil) return out;
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, unique.length) }, async () => {
    while (next < unique.length) {
      const id = unique[next++]!;
      try { out[id] = await cachedUser(id); } catch { out[id] = null; }
    }
  }));
  return out;
}

export const discordConfigured = () => !!process.env.DISCORD_BOT_TOKEN;

/** Cheap token check (cached 60 s) so the UI can explain why names are missing. */
const checkToken = unstable_cache(async (): Promise<DiscordStatus> => {
  try {
    const res = await fetch(`${API}/users/@me`, { headers: authHeader(), cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (res.status === 401) return 'invalid';
    return res.ok ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}, ['discord-token-check'], { revalidate: 60 });

export async function discordStatus(): Promise<DiscordStatus> {
  return process.env.DISCORD_BOT_TOKEN ? checkToken() : 'missing';
}
