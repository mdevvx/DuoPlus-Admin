import { HTML_MAX, PREHEADER_MAX, SUBJECT_MAX, URL_VARS, VAR_NAMES } from './vars';

export interface Issue { level: 'error' | 'warn'; message: string; field: 'subject' | 'preheader' | 'html' | 'text'; line?: number }
export interface TemplateInput { subject: string; preheader: string; html: string; text: string; category: string }

const TOKEN = /\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g;
const BLOCKED_TAGS = /<\s*(script|iframe|form|video|object|embed)\b/gi;

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length]![b.length]!;
}
export function suggest(name: string): string | null {
  let best: [string, number] | null = null;
  for (const v of VAR_NAMES) { const n = distance(name.toLowerCase(), v); if (!best || n < best[1]) best = [v, n]; }
  return best && best[1] <= 3 ? best[0] : null;
}

function lineOf(src: string, index: number) { return src.slice(0, index).split('\n').length; }

function variableIssues(src: string, field: Issue['field'], out: Issue[]) {
  for (const m of src.matchAll(TOKEN)) {
    const triple = m[1] !== undefined;
    const name = (m[1] ?? m[2])!;
    const line = lineOf(src, m.index ?? 0);
    if (!VAR_NAMES.has(name)) {
      const s = suggest(name);
      out.push({ level: 'error', field, line, message: `{{${name}}} is not a known variable${s ? ` — did you mean {{${s}}}?` : '.'}` });
    } else if (triple && !URL_VARS.has(name)) {
      out.push({ level: 'warn', field, line, message: `{{{${name}}}} is still escaped: only the *_url variables can use three braces.` });
    }
  }
}

/** Shared by the editor (live) and the server (on save). The server re-runs it, so never trust the client's result. */
export function validateTemplate(t: TemplateInput): Issue[] {
  const out: Issue[] = [];
  const subject = t.subject.trim();
  if (!subject) out.push({ level: 'error', field: 'subject', message: 'Subject is required.' });
  if (t.subject.length > SUBJECT_MAX) out.push({ level: 'error', field: 'subject', message: `Subject is over ${SUBJECT_MAX} characters.` });
  else if (t.subject.length > 60) out.push({ level: 'warn', field: 'subject', message: 'Many inboxes cut the subject after about 60 characters.' });
  if (/[\r\n]/.test(t.subject)) out.push({ level: 'error', field: 'subject', message: 'Subject must be a single line.' });
  if (t.preheader.length > PREHEADER_MAX) out.push({ level: 'error', field: 'preheader', message: `Preheader is over ${PREHEADER_MAX} characters.` });
  if (!t.html.trim()) out.push({ level: 'error', field: 'html', message: 'HTML body is required.' });
  if (!t.text.trim()) out.push({ level: 'error', field: 'text', message: 'Plain-text body is required.' });
  if (new TextEncoder().encode(t.html).length > HTML_MAX) out.push({ level: 'error', field: 'html', message: 'HTML is larger than 100 KB.' });

  variableIssues(t.subject, 'subject', out);
  variableIssues(t.preheader, 'preheader', out);
  variableIssues(t.html, 'html', out);
  variableIssues(t.text, 'text', out);

  for (const m of t.html.matchAll(BLOCKED_TAGS)) out.push({ level: 'warn', field: 'html', line: lineOf(t.html, m.index ?? 0), message: `<${m[1]!.toLowerCase()}> is not allowed in email and will be removed on save.` });
  for (const m of t.html.matchAll(/\son[a-z]+\s*=/gi)) out.push({ level: 'warn', field: 'html', line: lineOf(t.html, m.index ?? 0), message: 'Event handlers such as onclick are removed on save.' });
  if (/<style\b/i.test(t.html)) out.push({ level: 'warn', field: 'html', message: 'Inline <style> blocks are dropped by many mail clients. Use style="…" attributes.' });

  for (const m of t.html.matchAll(/\b(href|src)\s*=\s*(["'])(.*?)\2/gi)) {
    const url = m[3]!.trim();
    const line = lineOf(t.html, m.index ?? 0);
    const varOnly = /^\{\{\{\s*(\w+)\s*\}\}\}$/.exec(url);
    if (varOnly) { if (!URL_VARS.has(varOnly[1]!) && VAR_NAMES.has(varOnly[1]!)) out.push({ level: 'error', field: 'html', line, message: `{{{${varOnly[1]}}}} is not a link variable. Use one of the *_url variables.` }); continue; }
    if (/^javascript:/i.test(url)) out.push({ level: 'error', field: 'html', line, message: 'javascript: links are not allowed.' });
    else if (m[1]!.toLowerCase() === 'href' && !/^(https:\/\/|mailto:)/i.test(url)) out.push({ level: 'error', field: 'html', line, message: `Link "${url.slice(0, 60)}" must start with https:// or mailto:, or be a {{{…_url}}} variable.` });
    else if (m[1]!.toLowerCase() === 'src' && !/^https:\/\//i.test(url)) out.push({ level: 'error', field: 'html', line, message: 'Image addresses must start with https://.' });
  }
  if (t.category === 'marketing' && /unsubscribe/i.test(t.html) && !/unsubscribe_url/.test(t.html)) {
    out.push({ level: 'warn', field: 'html', message: 'The body mentions "unsubscribe" but not {{{unsubscribe_url}}}. The layout already adds the link, so you can drop this text.' });
  }
  return out;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === 'error');
