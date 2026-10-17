// After `npm run build`: fail if any secret value or server-only name appears in client-served files.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(f); } catch { /* optional */ } }

const needles = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SESSION_SECRET].filter((v): v is string => !!v && v.length > 16);
const names = ['SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const bad: string[] = [];
for (const file of walk('.next/static')) {
  if (!/\.(js|css|map|html|json)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const n of needles) if (text.includes(n)) bad.push(`${file}: contains a secret value`);
  for (const n of names) if (text.includes(n)) bad.push(`${file}: references ${n}`);
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log('Client bundle clean: no secret values or server-only variable names found.');
