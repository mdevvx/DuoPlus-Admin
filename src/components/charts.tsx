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
  const w = 720, padL = 60, padR = 12, padT = 12, padB = 24, h = height;
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
            {i === data.findIndex((p) => p.value === max) && <circle cx={pts[i]![0]} cy={pts[i]![1]} r="4" fill="var(--surface)" stroke={color} strokeWidth="2" />}
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
    <div className="h-2 w-full overflow-hidden rounded bg-subtle" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export interface Segment { label: string; value: number; color?: string }

/** Donut with a centre total and a two-column legend below, as on the reference analytics page. */
export function Donut({ segments, centerLabel, format = int }: { segments: Segment[]; centerLabel: string; format?: (n: number) => string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 58, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 160 160" className="h-44 w-44 -rotate-90" role="img" aria-label={`${centerLabel}: ${format(total)}`}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--subtle)" strokeWidth="22" />
        {total > 0 && segments.map((s, i) => {
          const len = (s.value / total) * c;
          const gap = segments.filter((x) => x.value > 0).length > 1 ? 2 : 0;
          const el = <circle key={s.label} cx="80" cy="80" r={r} fill="none" stroke={s.color ?? CHART_COLORS[i % 5]} strokeWidth="22" strokeDasharray={`${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`} strokeDashoffset={-offset}><title>{`${s.label}: ${format(s.value)}`}</title></circle>;
          offset += len;
          return el;
        })}
        <g transform="rotate(90 80 80)" textAnchor="middle">
          <text x="80" y="76" fontSize="11" fill="var(--muted)">{centerLabel}</text>
          <text x="80" y="98" fontSize="24" fontWeight="700" fill="var(--ink)">{format(total)}</text>
        </g>
      </svg>
      <ul className="mt-4 grid w-full grid-cols-2 gap-x-6 gap-y-2.5">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color ?? CHART_COLORS[i % 5] }} />
            <span className="flex-1 truncate text-[13px]">{s.label}</span>
            <span className="num text-[13px] font-semibold">{format(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Vertical bars with a blue-to-teal gradient, rounded tops, y-axis labels and a tooltip per bar. */
export function BarChart({ data, format = int, label, height = 250 }: {
  data: Point[]; color?: string; format?: (n: number) => string; label: string; height?: number;
}) {
  const w = 720, h = height, padL = 68, padR = 8, padT = 10, padB = 26;
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = Math.ceil(max / 4) * 4 || 4;
  const slot = (w - padL - padR) / Math.max(1, data.length);
  const bw = Math.min(26, slot * 0.62);
  const y = (v: number) => padT + (1 - v / nice) * (h - padT - padB);
  const id = uid('bars' + label);
  const total = data.reduce((a, d) => a + d.value, 0);
  const every = data.length > 16 ? Math.ceil(data.length / 10) : 1;
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`${label}: ${format(total)} over ${data.length} days`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" />
            <stop offset="100%" stopColor="var(--chart-2)" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={w - padR} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={padL - 10} y={y(nice * f) + 3} fontSize="11" textAnchor="end" fill="var(--muted)">{format(Math.round(nice * f))}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = padL + i * slot + (slot - bw) / 2;
          const top = y(d.value), base = y(0), r = Math.min(2, bw / 2, base - top);
          const path = d.value <= 0 ? '' : `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${base} Z`;
          return (
            <g key={d.day}>
              <rect x={padL + i * slot} y={padT} width={slot} height={h - padT - padB} fill="transparent"><title>{`${d.day}: ${format(d.value)}`}</title></rect>
              {path && <path d={path} fill={`url(#${id})`} />}
              {i % every === 0 && <text x={x0 + bw / 2} y={h - 8} fontSize="11" textAnchor="middle" fill="var(--muted)">{d.day.slice(5).replace('-', '/')}</text>}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Ranked list with a thin progress bar under each row. */
export function RankedBars({ items, format = int }: { items: Segment[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((a, i) => a + i.value, 0);
  return (
    <ul className="space-y-4">
      {items.map((it, i) => (
        <li key={`${i}-${it.label}`}>
          <div className="mb-1.5 flex items-center gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-subtle text-[11px] font-semibold text-muted">{i + 1}</span>
            <span className="flex-1 truncate text-[13.5px] font-medium">{it.label}</span>
            <span className="num text-[13px] font-semibold">{format(it.value)}</span>
            <span className="num w-10 text-right text-xs text-muted">{total ? Math.round((it.value / total) * 100) : 0}%</span>
          </div>
          <div className="ml-8 h-1.5 overflow-hidden rounded bg-subtle">
            <div className="h-full rounded" style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? CHART_COLORS[i % 5] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One bar split into coloured parts (done / running / failed style) with a legend. */
export function SegmentBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded bg-subtle" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(', ')}>
        {total > 0 && segments.filter((s) => s.value > 0).map((s, i) => <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color ?? CHART_COLORS[i % 5] }} title={`${s.label}: ${s.value}`} />)}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
        {segments.map((s, i) => <li key={s.label} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color ?? CHART_COLORS[i % 5] }} />{int(s.value)} {s.label.toLowerCase()}</li>)}
      </ul>
    </div>
  );
}

/** Small circular gauge (0-100) with the number in the middle. */
export function Ring({ value, label, color = 'var(--chart-2)', size = 56 }: { value: number; label?: string; color?: string; size?: number }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 22, c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 56 56" width={size} height={size} role="img" aria-label={`${label ?? 'Score'}: ${Math.round(v)} out of 100`}>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 28 28)" />
        <text x="28" y="32" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)">{Math.round(v)}</text>
      </svg>
      {label && <span className="text-xs leading-4 text-muted">{label}</span>}
    </div>
  );
}
