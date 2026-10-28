import { describe, expect, it } from 'vitest';
import { buttonHtml } from '@/products/disconotify/email/button';
import { listButtons, moveBlock, removeBlock, replaceBlock, splitBlocks } from '@/products/disconotify/email/blocks';
import { parseBotSettingsForm } from '@/products/disconotify/bot-settings';
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

describe('email buttons', () => {
  const base = { text: 'Open <it>', style: 'filled' as const, color: '#5B6CF0', align: 'center' as const };
  it('keeps a variable link and its styling through the sanitizer', () => {
    for (const href of ['{{{manage_url}}}', 'https://example.com/a?b=1', 'mailto:help@example.com']) {
      for (const style of ['filled', 'outline'] as const) {
        const html = buttonHtml({ ...base, style, href });
        const clean = sanitizeEmailHtml(html);
        expect(clean).toContain(`href="${href}"`);
        expect(clean).toContain('border-radius:8px');
        expect(clean).toContain('Open &lt;it&gt;');
        expect(hasErrors(validateTemplate({ subject: 's', preheader: '', html: clean, text: 't', category: 'transactional' }))).toBe(false);
      }
    }
  });
  it('uses dark text on a light colour', () => {
    expect(buttonHtml({ ...base, href: '{{{manage_url}}}', color: '#FFE08A' })).toContain('color:#1b1b22');
    expect(buttonHtml({ ...base, href: '{{{manage_url}}}', color: '#1B1B88' })).toContain('color:#ffffff');
  });
});

describe('moving buttons', () => {
  const b1 = buttonHtml({ text: 'First', href: '{{{manage_url}}}', style: 'filled', color: '#5B6CF0', align: 'center' });
  const b2 = buttonHtml({ text: 'Tom & "Jerry"', href: 'https://example.com/a?x=1&y=2', style: 'outline', color: '#1B1B88', align: 'left' });
  const body = `<h1>Hello</h1>\n<p>Intro <b>text</b></p>\n${b1}\n<table><tr><td><p>nested</p></td></tr></table>\n${b2}\nplain tail`;

  it('splits top-level blocks without touching their content', () => {
    const blocks = splitBlocks(body);
    expect(blocks).toEqual(['<h1>Hello</h1>', '<p>Intro <b>text</b></p>', b1, '<table><tr><td><p>nested</p></td></tr></table>', b2, 'plain tail']);
  });
  it('lists buttons and reads them back', () => {
    const list = listButtons(body);
    expect(list.map((x) => x.index)).toEqual([2, 4]);
    expect(list[1]!.spec).toEqual({ text: 'Tom & "Jerry"', href: 'https://example.com/a?x=1&y=2', style: 'outline', color: '#1B1B88', align: 'left' });
  });
  it('moves a button up and down, and stops at the ends', () => {
    expect(splitBlocks(moveBlock(body, 2, -1))[1]).toBe(b1);
    expect(splitBlocks(moveBlock(body, 2, 1))[3]).toBe(b1);
    expect(moveBlock(body, 0, -1)).toBe(body);
    expect(moveBlock(body, 5, 1)).toBe(body);
  });
  it('removes and replaces a block', () => {
    expect(splitBlocks(removeBlock(body, 2))).not.toContain(b1);
    expect(splitBlocks(replaceBlock(body, 2, '<p>x</p>'))[2]).toBe('<p>x</p>');
  });
});

describe('bot settings form', () => {
  const form = (o: Record<string, string>) => (k: string) => o[k] ?? '';
  it('accepts values, treats empty boxes as the bot default', () => {
    expect(parseBotSettingsForm(form({ price_usd: '1.99', trial_days: '7', grace_days: '' }))).toEqual({ price_usd: 1.99, trial_days: 7 });
    expect(parseBotSettingsForm(form({}))).toEqual({});
  });
  it('rejects bad numbers and out-of-range values', () => {
    expect(() => parseBotSettingsForm(form({ price_usd: 'abc' }))).toThrow();
    expect(() => parseBotSettingsForm(form({ price_usd: '0.10' }))).toThrow();
    expect(() => parseBotSettingsForm(form({ trial_days: '2.5' }))).toThrow();
    expect(() => parseBotSettingsForm(form({ trial_days: '91' }))).toThrow();
  });
});
