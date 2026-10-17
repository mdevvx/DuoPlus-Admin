/**
 * Discord snowflakes are 17-19 digit integers; JSON.parse would round them (> 2^53).
 * Quote every bare integer of 16+ digits in a JSON document before parsing, string-aware so
 * digits inside string values are left alone. Floats/exponents are not touched.
 */
export function quoteBigInts(json: string): string {
  let out = '';
  let i = 0;
  const n = json.length;
  while (i < n) {
    const ch = json[i]!;
    if (ch === '"') {
      let j = i + 1;
      while (j < n && json[j] !== '"') j += json[j] === '\\' ? 2 : 1;
      out += json.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i + (ch === '-' ? 1 : 0);
      const digitsStart = j;
      while (j < n && json[j]! >= '0' && json[j]! <= '9') j++;
      const isFloat = json[j] === '.' || json[j] === 'e' || json[j] === 'E';
      if (!isFloat && j - digitsStart >= 16) {
        out += `"${json.slice(i, j)}"`;
      } else {
        // copy the whole numeric token (including fraction/exponent)
        while (j < n && /[0-9.eE+-]/.test(json[j]!)) j++;
        out += json.slice(i, j);
      }
      i = j;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** fetch wrapper for supabase-js: responses come back with big integers as strings. */
export const bigIntSafeFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, { ...init, cache: 'no-store' });
  if (!(res.headers.get('content-type') ?? '').includes('json')) return res;
  const text = await res.text();
  return new Response(quoteBigInts(text), { status: res.status, statusText: res.statusText, headers: res.headers });
};
