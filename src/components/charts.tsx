import { int } from '@/lib/format';

export const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
type Point = { day: string; value: number };

/** Smooth line through points (monotone-ish Catmull-Rom converted to cubic Beziers). */
function smooth(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const uid = (s: string) => 'g' + s.replace(/[^a-z0-9]/gi, '').slice(0, 24);

/** Full-size area chart with grid, axis labels and per-point tooltips. Pure SVG, theme tokens only. */
export function AreaChart({ data, color = 'var(--chart-1)', format = int, label, height = 220 }: {
  data: Point[]; color?: string; format?: (n: number) => string; label: string; height?: number;
}) {
  const w = 720, padL = 44, padR = 12, padT = 12, padB = 24, h = height;
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = Math.ceil(max / 4) * 4 || 4;
  const x = (i: number) => padL + (i * (w - padL - padR)) / Math.max(1, data.length - 1);
  const y = (v: number) => padT + (1 - v / nice) * (h - padT - padB);
  const pts = data.map((d, i): [number, number] => [Math.round(x(i) * 10) / 10, Math.round(y(d.value) * 10) / 10]);
  const line = smooth(pts);
  const area = `${line} L${pts.at(-1)?.[0]},${h - padB} L${pts[0]?.[0]},${h - padB} Z`;
  const id = uid(label);
  const total = data.reduce((a, d) => a + d.value, 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`${label}: ${format(total)} over ${data.length} days`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(nice * t)} y2={y(nice * t)} stroke="var(--chart-grid)" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={padL - 8} y={y(nice * t) + 3} fontSize="10" textAnchor="end" fill="var(--muted)">{format(Math.round(nice * t))}</text>
          </g>
        ))}
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={d.day}>
            <rect x={x(i) - (w - padL - padR) / data.length / 2} y={padT} width={(w - padL - padR) / data.length} height={h - padT - padB} fill="transparent"><title>{`${d.day}: ${format(d.value)}`}</title></rect>
            {d.value === max && <circle cx={pts[i]![0]} cy={pts[i]![1]} r="4" fill="var(--surface)" stroke={color} strokeWidth="2" />}
          </g>
        ))}
        {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => (
          <text key={i} x={x(i)} y={h - 6} fontSize="10" fill="var(--muted)" textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>{data[i]?.day.slice(5)}</text>
        ))}
      </svg>
    </figure>
  );
}

/** Tiny trend line for stat cards. */
export function Sparkline({ values, color = 'var(--chart-1)', height = 44 }: { values: number[]; color?: string; height?: number }) {
  const w = 240, max = Math.max(1, ...values), min = Math.min(0, ...values);
  const pts = values.map((v, i): [number, number] => [(i * w) / Math.max(1, values.length - 1), 4 + (1 - (v - min) / (max - min || 1)) * (height - 8)]);
  const line = smooth(pts);
  const id = uid('spark' + color + values.length + max);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Tiny bar strip for stat cards. */
export function MiniBars({ values, color = 'var(--chart-2)', height = 44 }: { values: number[]; color?: string; height?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1" style={{ height }} aria-hidden>
      {values.map((v, i) => <span key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: 0.35 + 0.65 * (v / max) }} />)}
    </div>
  );
}

export function ProgressBar({ value, max = 100, color = 'var(--chart-1)' }: { value: number; max?: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export interface Segment { label: string; value: number; color?: string }

/** Donut with a centre total and a legend showing each share. */
export function Donut({ segments, centerLabel, format = int }: { segments: Segment[]; centerLabel: string; format?: (n: number) => string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 52, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label={`${centerLabel}: ${format(total)}`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--subtle)" strokeWidth="16" />
        {total > 0 && segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = <circle key={s.label} cx="70" cy="70" r={r} fill="none" stroke={s.color ?? CHART_COLORS[i % 5]} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`} strokeDashoffset={-offset}><title>{`${s.label}: ${format(s.value)}`}</title></circle>;
          offset += len;
          return el;
        })}
        <g transform="rotate(90 70 70)" textAnchor="middle">
          <text x="70" y="68" fontSize="22" fontWeight="600" fill="var(--ink)">{format(total)}</text>
          <text x="70" y="86" fontSize="10" fill="var(--muted)">{centerLabel}</text>
        </g>
      </svg>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color ?? CHART_COLORS[i % 5] }} />
            <span className="flex-1 truncate">{s.label}</span>
            <span className="num font-medium">{format(s.value)}</span>
            <span className="num w-10 text-right text-xs text-muted">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Original bar chart, still used where bars read better than a line. */
export function BarChart({ data, color = 'var(--chart-1)', format = int, label }: {
  data: Point[]; color?: string; format?: (n: number) => string; label: string;
}) {
  const w = 560, h = 120, pad = 4;
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = (w - pad * 2) / data.length;
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 16}`} className="w-full" role="img" aria-label={`${label}: ${format(total)} over ${data.length} days`}>
        {[0.5, 1].map((f) => <line key={f} x1={0} x2={w} y1={h - f * (h - 8)} y2={h - f * (h - 8)} stroke="var(--chart-grid)" strokeWidth={1} />)}
        {data.map((d, i) => {
          const bh = (d.value / max) * (h - 8);
          return <rect key={d.day} x={pad + i * bw + 1} y={h - bh} width={Math.max(1, bw - 2)} height={bh} rx={2} fill={color}><title>{`${d.day}: ${format(d.value)}`}</title></rect>;
        })}
        <text x={2} y={10} fontSize={10} fill="var(--muted)">{format(max)}</text>
        <text x={0} y={h + 12} fontSize={10} fill="var(--muted)">{data[0]?.day.slice(5)}</text>
        <text x={w} y={h + 12} fontSize={10} fill="var(--muted)" textAnchor="end">{data.at(-1)?.day.slice(5)}</text>
      </svg>
      <figcaption className="mt-1 text-xs text-muted">{label} · total <span className="num">{format(total)}</span></figcaption>
    </figure>
  );
}
