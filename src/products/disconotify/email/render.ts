import { URL_VARS, VAR_NAMES, type EmailLayout } from './vars';

/**
 * Template rendering rules, mirrored from the bot:
 *  - {{name}} is HTML-escaped.
 *  - {{{name}}} is raw only for the *_url variables (for href="…"); any other name stays escaped.
 *  - A name that is not a known variable renders as empty.
 * Keep this in step with the bot's renderer (see the golden cases in tests/email.test.ts).
 */
const TOKEN = /\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g;

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Raw URLs still lose characters that could break out of an attribute. */
const safeRawUrl = (s: string) => s.replace(/["'<>\s]/g, '');

export function renderTemplate(src: string, vars: Record<string, string>, mode: 'html' | 'text' = 'html'): string {
  return src.replace(TOKEN, (_m, triple: string | undefined, dbl: string | undefined) => {
    const name = (triple ?? dbl)!;
    if (!VAR_NAMES.has(name)) return '';
    const v = vars[name] ?? '';
    if (mode === 'text') return v;
    return triple && URL_VARS.has(name) ? safeRawUrl(v) : escapeHtml(v);
  });
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** Rough HTML to plain-text conversion for the "Generate from HTML" button. Variables are left in place. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => {
      const t = text.replace(/<[^>]+>/g, '').trim();
      return t && t !== href ? `${t} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|tr|ul|ol|table)>/gi, '\n\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** WCAG contrast ratio of a hex colour against white. */
export function contrastOnWhite(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return 1.05 / (L + 0.05);
}

export interface RenderInput {
  subject: string; preheader: string; html: string; text: string;
  marketing: boolean; layout: EmailLayout; vars: Record<string, string>; dark?: boolean;
}
export interface Rendered { subject: string; preheader: string; html: string; text: string; document: string }

/** Wraps an already sanitized body in the shared layout. `document` is what goes into the preview iframe. */
export function renderEmail(i: RenderInput): Rendered {
  const vars = { ...i.vars, brand_name: i.layout.brand_name, ...(i.marketing ? {} : { unsubscribe_url: '' }) };
  const subject = renderTemplate(i.subject, vars, 'text');
  const preheader = renderTemplate(i.preheader, vars, 'text');
  const body = renderTemplate(i.html, vars);
  const text = renderTemplate(i.text, vars, 'text');
  const footer = renderTemplate(i.layout.footer_html, vars);
  const accent = /^#[0-9a-fA-F]{6}$/.test(i.layout.accent_color) ? i.layout.accent_color : '#5B6CF0';
  const logo = /^https:\/\//i.test(i.layout.logo_url)
    ? `<img src="${escapeHtml(i.layout.logo_url)}" alt="${escapeHtml(i.layout.brand_name)}" style="max-height:48px;height:auto;border:0">`
    : `<span style="font-size:20px;font-weight:700;color:${accent}">${escapeHtml(i.layout.brand_name)}</span>`;
  const unsub = i.marketing && vars.unsubscribe_url
    ? `<p style="margin:12px 0 0"><a href="${safeRawUrl(vars.unsubscribe_url)}" style="color:inherit">Unsubscribe</a> from these reminders.</p>` : '';
  const dark = !!i.dark;
  const bg = dark ? '#14141a' : '#f4f4f7';
  const card = dark ? '#1e1e26' : '#ffffff';
  const ink = dark ? '#ececf1' : '#1b1b22';
  const muted = dark ? '#9a9aa8' : '#6b6b78';
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${dark ? 'dark' : 'light'}">
<style>body{margin:0;background:${bg};color:${ink};font:15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}a{color:${accent}}img{max-width:100%}</style></head>
<body><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${card};border-radius:12px;border-top:4px solid ${accent}">
<tr><td style="padding:24px 28px 8px">${logo}</td></tr>
<tr><td style="padding:8px 28px 24px">${body}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid ${dark ? '#2c2c36' : '#e7e7ee'};font-size:12.5px;color:${muted}">${footer}${unsub}</td></tr>
</table></td></tr></table></body></html>`;
  const unsubText = i.marketing && vars.unsubscribe_url ? `\n\nUnsubscribe: ${vars.unsubscribe_url}` : '';
  return { subject, preheader, html: body, text: `${text}\n\n--\n${renderTemplate(i.layout.footer_text, vars, 'text')}${unsubText}`, document };
}
