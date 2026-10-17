import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE } from './session-policy';

export type ThemeChoice = 'light' | 'dark' | 'system';

/** The visitor's chosen theme. Light is the default until they pick another. */
export async function currentTheme(): Promise<ThemeChoice> {
  const v = (await cookies()).get(COOKIE.theme)?.value;
  return v === 'dark' || v === 'system' || v === 'light' ? v : 'light';
}
