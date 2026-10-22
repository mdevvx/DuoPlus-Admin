import { contrastOnWhite, escapeHtml } from './render';

export type ButtonStyle = 'filled' | 'outline';

/** Email-safe button: an inline-styled link in a centred or left paragraph. Nothing here is removed by the sanitizer. */
export function buttonHtml(o: { text: string; href: string; style: ButtonStyle; color: string; align: 'left' | 'center' }) {
  const on = contrastOnWhite(o.color) >= 3 ? '#ffffff' : '#1b1b22';
  const look = o.style === 'filled'
    ? `background-color:${o.color};color:${on};border:2px solid ${o.color}`
    : `color:${o.color};border:2px solid ${o.color}`;
  return `<p style="text-align:${o.align};margin:20px 0"><a href="${o.href}" style="display:inline-block;padding:12px 26px;border-radius:8px;${look};text-decoration:none;font-weight:600">${escapeHtml(o.text)}</a></p>`;
}
