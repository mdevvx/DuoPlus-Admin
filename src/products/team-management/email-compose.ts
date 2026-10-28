/** Pure helpers for the Send email page, so they can be tested. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_RECIPIENTS = 50;

/** Addresses from pasted text (spaces, commas, semicolons or new lines): lower-cased, de-duplicated, with the ones that are not addresses set aside. */
export function parseRecipients(text: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const a = raw.toLowerCase();
    if (!EMAIL.test(a)) { invalid.push(raw); continue; }
    if (seen.has(a)) continue;
    seen.add(a);
    valid.push(a);
  }
  return { valid, invalid };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * An approximate preview of a manual email: heading, paragraphs split on blank lines, {{name}} filled in, optional button.
 * Everything typed is escaped, and the result is only ever shown in a sandboxed frame.
 */
export function composePreview(m: { heading?: string; body: string; button?: { label: string; url: string } | null; name?: string }): string {
  const name = m.name ?? 'Alex';
  const paragraphs = m.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px">${esc(p.replace(/\{\{\s*name\s*\}\}/g, name)).replace(/\n/g, '<br>')}</p>`).join('');
  const safeUrl = m.button && /^https:\/\/\S+$/i.test(m.button.url.trim()) ? m.button.url.trim() : null;
  const button = m.button && m.button.label.trim()
    ? `<p style="margin:22px 0"><a href="${safeUrl ? esc(safeUrl) : '#'}" style="display:inline-block;padding:12px 24px;border-radius:8px;background:#5B6CF0;color:#fff;text-decoration:none;font-weight:600">${esc(m.button.label.trim())}</a></p>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f4f7;font:15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1b22">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;padding:28px 32px">
${m.heading?.trim() ? `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${esc(m.heading.trim().replace(/\{\{\s*name\s*\}\}/g, name))}</h1>` : ''}${paragraphs || '<p style="color:#8b8b95">Your message appears here.</p>'}${button}
</div></body></html>`;
}
