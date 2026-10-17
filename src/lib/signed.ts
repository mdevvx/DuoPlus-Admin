// HMAC-signed timestamps using Web Crypto, so the same code runs in middleware (edge) and Node.
const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `<epoch-ms>.<signature>` bound to a purpose and a subject (user id). */
export async function signStamp(secret: string, purpose: string, subject: string, at = Date.now()): Promise<string> {
  return `${at}.${await hmac(secret, `${purpose}|${subject}|${at}`)}`;
}

/** Returns the signed timestamp, or null if missing/forged/for another subject. */
export async function readStamp(secret: string, purpose: string, subject: string, value: string | undefined): Promise<number | null> {
  if (!value) return null;
  const [ts, sig] = value.split('.');
  if (!ts || !sig || !/^\d{10,16}$/.test(ts)) return null;
  const expected = await hmac(secret, `${purpose}|${subject}|${ts}`);
  return safeEqual(sig, expected) ? Number(ts) : null;
}
