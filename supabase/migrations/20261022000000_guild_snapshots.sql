-- Last known name and icon of each Discord server, so servers the bot has left keep their identity.
-- Discord only answers for servers the bot is in; the panel saves every successful lookup here.
create table if not exists duolplus_admin.hub_guild_snapshots (
  guild_id   text primary key check (guild_id ~ '^[0-9]{5,25}$'),
  name       text not null,
  icon_url   text,
  updated_at timestamptz not null default now()
);

alter table duolplus_admin.hub_guild_snapshots enable row level security;
revoke all on duolplus_admin.hub_guild_snapshots from public, anon, authenticated;
grant select, insert, update on duolplus_admin.hub_guild_snapshots to service_role;
