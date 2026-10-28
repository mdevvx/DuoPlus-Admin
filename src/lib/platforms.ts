/**
 * The one place that knows which monitoring platforms exist. The platform is a plain string in the data, so a new
 * platform is one line here: its name, brand colour and, when the bot stores a handle, the link to the account.
 */
export interface PlatformInfo {
  label: string;
  /** Brand colour, used for the dot on badges and in charts. */
  color: string;
  /** Link to the channel or profile for a stored `username`; omitted where the panel does not link. */
  accountUrl?: (username: string) => string;
}

const enc = encodeURIComponent;

export const PLATFORMS: Record<string, PlatformInfo> = {
  youtube: { label: 'YouTube', color: '#FF0000' },
  kick: { label: 'Kick', color: '#53FC18' },
  // Twitch: `username` is the lowercase login and `platform_account_id` is Twitch's numeric user ID.
  twitch: { label: 'Twitch', color: '#9146FF', accountUrl: (u) => `https://twitch.tv/${enc(u.toLowerCase())}` },
  instagram: { label: 'Instagram', color: '#E4405F' },
  twitter: { label: 'Twitter / X', color: '#1D9BF0' },
  x: { label: 'Twitter / X', color: '#1D9BF0' },
  tiktok: { label: 'TikTok', color: '#FE2C55', accountUrl: (u) => `https://www.tiktok.com/@${enc(u)}` },
  facebook: { label: 'Facebook', color: '#1877F2' },
  reddit: { label: 'Reddit', color: '#FF4500' },
  discord: { label: 'Discord', color: '#5865F2' },
};

const key = (p: string | null | undefined) => (p ?? '').trim().toLowerCase();
const KNOWN_ORDER = Object.keys(PLATFORMS);

/** Sort position of a platform; unknown ones go last. */
export const platformOrder = (p: string | null | undefined) => { const i = KNOWN_ORDER.indexOf(key(p)); return i === -1 ? 99 : i; };
export const platformColor = (p: string | null | undefined) => PLATFORMS[key(p)]?.color ?? '#8b8b95';

/** Channel link for a monitored account, or null where there is none (or no username). */
export function accountUrl(platform: string | null | undefined, username: string | null | undefined): string | null {
  const u = (username ?? '').trim();
  return u ? PLATFORMS[key(platform)]?.accountUrl?.(u) ?? null : null;
}
