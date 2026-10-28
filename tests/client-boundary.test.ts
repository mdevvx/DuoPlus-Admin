import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `next build` fails when browser code imports a module marked `import 'server-only'`. The other tests stub that marker, so they
 * cannot see the mistake. This walks every "use client" file's runtime imports and fails with the full import chain.
 */
const SRC = path.resolve(__dirname, '../src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}
const text = new Map(files(SRC).map((f) => [f, readFileSync(f, 'utf8')]));
const isServerOnly = (f: string) => /^import 'server-only';/m.test(text.get(f) ?? '');
const isClient = (f: string) => /^\s*['"]use client['"]/.test(text.get(f) ?? '');
const isServerAction = (f: string) => /^\s*['"]use server['"]/.test(text.get(f) ?? '');

function resolve(spec: string, from: string): string | null {
  const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  return [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx'), base].find((p) => text.has(p)) ?? null;
}

/** Imports that exist at runtime: `import type` and `import { type A }` are erased by the compiler. */
function runtimeImports(f: string): string[] {
  const out: string[] = [];
  for (const m of (text.get(f) ?? '').matchAll(/^import\s+(type\s+)?([^;]*?)\s+from\s+'([^']+)';/gms)) {
    if (m[1]) continue;
    const names = m[2]!;
    if (names.startsWith('{') && names.replace(/[{}\s]/g, '').split(',').filter(Boolean).every((n) => n.startsWith('type'))) continue;
    const target = resolve(m[3]!, f);
    if (target) out.push(target);
  }
  return out;
}

describe('browser code stays out of server-only modules', () => {
  it('no "use client" file reaches a server-only module', () => {
    const problems: string[] = [];
    for (const client of [...text.keys()].filter(isClient)) {
      const seen = new Set<string>();
      const walk = (f: string, chain: string[]) => {
        if (seen.has(f)) return;
        seen.add(f);
        for (const t of runtimeImports(f)) {
          if (isServerOnly(t)) problems.push([...chain, f, t].map((x) => path.relative(SRC, x).replace(/\\/g, '/')).join(' -> '));
          else if (!isServerAction(t)) walk(t, [...chain, f]); // a "use server" file is called from the browser, never bundled into it
        }
      };
      walk(client, []);
    }
    expect(problems).toEqual([]);
  });
});
