import { describe, expect, it } from 'vitest';
import { renderTemplate, htmlToText, contrastOnWhite } from '@/products/disconotify/email/render';
import { sanitizeEmailHtml } from '@/products/disconotify/email/sanitize';
import { hasErrors, validateTemplate } from '@/products/disconotify/email/validate';
import { layoutSchema, scheduleSchema, DEFAULT_LAYOUT } from '@/products/disconotify/email/vars';

const vars = { server_name: '<b>x</b>', subscribe_url: 'https://disconotify.com/subscribe' };

describe('template rendering (golden cases shared with the bot)', () => {
  it('escapes {{name}}', () => expect(renderTemplate('{{server_name}}', vars)).toBe('&lt;b&gt;x&lt;/b&gt;'));
  it('keeps {{{name}}} escaped for non-url variables', () => expect(renderTemplate('{{{server_name}}}', vars)).toBe('&lt;b&gt;x&lt;/b&gt;'));
  it('inserts {{{subscribe_url}}} raw inside href', () => expect(renderTemplate('<a href="{{{subscribe_url}}}">go</a>', vars)).toBe('<a href="https://disconotify.com/subscribe">go</a>'));
  it('renders unknown names as empty', () => expect(renderTemplate('a{{nope}}b{{{nope}}}c', vars)).toBe('abc'));
  it('strips characters that could break out of an attribute from raw urls', () => expect(renderTemplate('{{{subscribe_url}}}', { subscribe_url: 'https://x.com/"onclick=1' })).toBe('https://x.com/onclick=1'));
  it('does not escape in text mode', () => expect(renderTemplate('{{server_name}}', vars, 'text')).toBe('<b>x</b>'));
});

describe('validation', () => {
  const ok = { subject: 'Hi {{server_name}}', preheader: '', html: '<p>Hello</p>', text: 'Hello', category: 'transactional' };
  it('accepts a normal template', () => expect(hasErrors(validateTemplate(ok))).toBe(false));
  it('blocks an unknown variable and suggests the right one', () => {
    const i = validateTemplate({ ...ok, html: '<p>{{servername}}</p>' });
    expect(i.find((x) => x.level === 'error')?.message).toContain('{{server_name}}');
  });
  it('blocks javascript: and non-https links', () => {
    expect(hasErrors(validateTemplate({ ...ok, html: '<a href="javascript:alert(1)">x</a>' }))).toBe(true);
    expect(hasErrors(validateTemplate({ ...ok, html: '<a href="http://x.com">x</a>' }))).toBe(true);
    expect(hasErrors(validateTemplate({ ...ok, html: '<a href="{{{manage_url}}}">x</a>' }))).toBe(false);
  });
  it('requires subject, html and text', () => expect(validateTemplate({ ...ok, subject: '', html: '', text: '' }).filter((i) => i.level === 'error')).toHaveLength(3));
});

describe('sanitizer', () => {
  it('strips scripts and handlers', () => {
    const out = sanitizeEmailHtml('<p onclick="x()">a</p><script>alert(1)</script><iframe src="https://e.com"></iframe>');
    expect(out).toBe('<p>a</p>');
  });
  it('keeps link variables in href', () => expect(sanitizeEmailHtml('<a href="{{{subscribe_url}}}">go</a>')).toContain('href="{{{subscribe_url}}}"'));
  it('drops javascript: urls', () => expect(sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript'));
});

describe('settings', () => {
  it('rejects unknown keys and bad ranges', () => {
    expect(layoutSchema.safeParse({ ...DEFAULT_LAYOUT, extra: 1 }).success).toBe(false);
    expect(scheduleSchema.safeParse({ renewal_days_before: 31, trial_reminder_every_days: 7, trial_reminder_max: 3 }).success).toBe(false);
    expect(scheduleSchema.safeParse({ renewal_days_before: 3.5, trial_reminder_every_days: 7, trial_reminder_max: 3 }).success).toBe(false);
    expect(scheduleSchema.safeParse({ renewal_days_before: 0, trial_reminder_every_days: 7, trial_reminder_max: 0 }).success).toBe(true);
  });
  it('computes contrast and plain text', () => {
    expect(contrastOnWhite('#000000')).toBeGreaterThan(20);
    expect(htmlToText('<p>Hi <a href="https://a.com">there</a></p>')).toBe('Hi there (https://a.com)');
  });
});
