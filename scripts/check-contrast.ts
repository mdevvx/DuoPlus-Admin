// Parses the theme tokens from globals.css and checks WCAG AA (4.5:1) for text pairs.
import { readFileSync } from 'node:fs';

export type Tokens = Record<string, string>;

export function parseThemes(css: string): { light: Tokens; dark: Tokens } {
  const grab = (re: RegExp): Tokens => {
    const m = css.match(re);
    if (!m?.[1]) throw new Error('theme block not found: ' + re);
    const out: Tokens = {};
    for (const [, k, val] of m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)) out[k!] = val!;
    return out;
  };
  return {
    light: grab(/:root\s*\{([^}]*)\}/),
    dark: grab(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/),
  };
}

const lin = (c: number) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export function ratio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background] token pairs that carry text.
export const PAIRS: [string, string][] = [
  ['ink', 'subtle'], ['muted', 'subtle'], ['accent', 'subtle'],
  ['ink', 'canvas'], ['ink', 'surface'], ['ink', 'raised'],
  ['muted', 'canvas'], ['muted', 'surface'], ['muted', 'raised'],
  ['accent-ink', 'accent'], ['accent', 'surface'], ['accent', 'canvas'], ['accent', 'accent-soft'],
  ['success', 'success-soft'], ['success', 'surface'],
  ['warning', 'warning-soft'], ['warning', 'surface'],
  ['danger', 'danger-soft'], ['danger', 'surface'],
  ['info', 'info-soft'], ['info', 'surface'],
  ['canvas', 'danger'],
  ['side-ink', 'side-bg'], ['side-muted', 'side-bg'], ['side-accent', 'side-bg'], ['side-accent', 'side-active'], ['side-ink', 'side-active'],
];

export function failures(css: string) {
  const themes = parseThemes(css);
  const bad: string[] = [];
  for (const [name, t] of Object.entries(themes)) {
    for (const [fg, bg] of PAIRS) {
      const r = ratio(t[fg]!, t[bg]!);
      if (r < 4.5) bad.push(`${name}: ${fg} on ${bg} = ${r.toFixed(2)}`);
    }
  }
  return { bad, themes };
}

if (process.argv[1]?.includes('check-contrast')) {
  const { bad, themes } = failures(readFileSync('src/app/globals.css', 'utf8'));
  for (const [name, t] of Object.entries(themes))
    for (const [fg, bg] of PAIRS) console.log(`${name.padEnd(5)} ${fg} / ${bg}: ${ratio(t[fg]!, t[bg]!).toFixed(2)}`);
  if (bad.length) { console.error('\nFAIL\n' + bad.join('\n')); process.exit(1); }
  console.log('\nAll pairs >= 4.5:1');
}
