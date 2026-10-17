import clsx from 'clsx';
import type { GuildInfo } from '@/lib/discord';

/** Server icon from Discord, or a coloured initial when there is none. */
export function ServerAvatar({ info, id, size = 32 }: { info?: GuildInfo | null; id: string; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (info?.iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- remote Discord CDN image, already sized by Discord
    return <img src={info.iconUrl} alt="" width={size} height={size} style={style} className="shrink-0 rounded-lg bg-subtle object-cover" loading="lazy" referrerPolicy="no-referrer" />;
  }
  const letter = (info?.name ?? '#').trim().charAt(0).toUpperCase() || '#';
  const hue = Number(BigInt(id) % 360n);
  return (
    <span aria-hidden style={{ ...style, background: `hsl(${hue} 35% 45%)` }} className={clsx('flex shrink-0 items-center justify-center rounded-lg font-semibold text-white')}>{letter}</span>
  );
}

/** Avatar + name, with the ID underneath. */
export function ServerIdentity({ info, id, size = 32, link, showId = true }: { info?: GuildInfo | null; id: string; size?: number; link?: React.ReactNode; showId?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <ServerAvatar info={info} id={id} size={size} />
      <div className="min-w-0">
        <div className="truncate font-medium">{link ?? info?.name ?? `Server …${id.slice(-6)}`}</div>
        {showId && <div className="truncate font-mono text-xs text-muted">{id}</div>}
      </div>
    </div>
  );
}
