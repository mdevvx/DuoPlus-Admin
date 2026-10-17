-- DuoPlus Admin: schema `duolplus_admin`. Run in the SQL editor / `supabase db push`.
-- After running: Supabase Dashboard > Settings > API > "Exposed schemas" must include `duolplus_admin` and `pulsenotify`.
-- Browser roles (anon/authenticated) get NOTHING; only the service role (server-side) touches these objects.

create schema if not exists duolplus_admin;
revoke all on schema duolplus_admin from public, anon, authenticated;
grant usage on schema duolplus_admin to service_role;

create table if not exists duolplus_admin.hub_admins (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(email)),
  display_name text,
  role text not null default 'admin' check (role in ('owner','admin')),
  active boolean not null default true,
  theme text not null default 'light' check (theme in ('system','light','dark')),
  created_by uuid references duolplus_admin.hub_admins(id),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists duolplus_admin.hub_products (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  description text,
  icon text,
  status text not null default 'active' check (status in ('active','maintenance','disabled')),
  schema_name text not null
);

create table if not exists duolplus_admin.hub_admin_products (
  admin_id uuid not null references duolplus_admin.hub_admins(id) on delete cascade,
  product_slug text not null references duolplus_admin.hub_products(slug) on delete cascade,
  role text not null check (role in ('admin')),
  primary key (admin_id, product_slug)
);

create table if not exists duolplus_admin.hub_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_id uuid,
  admin_email text,
  product_slug text,
  action text not null,
  target_type text,
  target_id text,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  reason text
);
create index if not exists hub_audit_at_idx on duolplus_admin.hub_audit_log (at desc);
create index if not exists hub_audit_product_idx on duolplus_admin.hub_audit_log (product_slug, at desc);
create index if not exists hub_audit_target_idx on duolplus_admin.hub_audit_log (target_type, target_id);

create table if not exists duolplus_admin.hub_login_attempts (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null,                 -- request | code | mfa | recovery
  ip text,
  email_hash text,                    -- sha256(lower(email)); never the raw address
  success boolean not null
);
create index if not exists hub_login_attempts_ip_idx on duolplus_admin.hub_login_attempts (ip, at desc);
create index if not exists hub_login_attempts_email_idx on duolplus_admin.hub_login_attempts (email_hash, at desc);

create table if not exists duolplus_admin.hub_recovery_codes (
  id bigint generated always as identity primary key,
  admin_id uuid not null references duolplus_admin.hub_admins(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz
);
create index if not exists hub_recovery_admin_idx on duolplus_admin.hub_recovery_codes (admin_id);

-- RLS on every table, no policies => no access for anon/authenticated; service_role bypasses RLS.
alter table duolplus_admin.hub_admins enable row level security;
alter table duolplus_admin.hub_products enable row level security;
alter table duolplus_admin.hub_admin_products enable row level security;
alter table duolplus_admin.hub_audit_log enable row level security;
alter table duolplus_admin.hub_login_attempts enable row level security;
alter table duolplus_admin.hub_recovery_codes enable row level security;

revoke all on all tables in schema duolplus_admin from public, anon, authenticated;
grant select, insert, update, delete on duolplus_admin.hub_admins, duolplus_admin.hub_products, duolplus_admin.hub_admin_products,
  duolplus_admin.hub_login_attempts, duolplus_admin.hub_recovery_codes to service_role;
-- audit log is append-only: no update / delete, even for the service role
grant select, insert on duolplus_admin.hub_audit_log to service_role;
grant usage, select on all sequences in schema duolplus_admin to service_role;

create or replace function duolplus_admin.deny_audit_mutation() returns trigger language plpgsql as $$
begin raise exception 'hub_audit_log is append-only'; end $$;
drop trigger if exists hub_audit_no_update on duolplus_admin.hub_audit_log;
create trigger hub_audit_no_update before update or delete on duolplus_admin.hub_audit_log
  for each row execute function duolplus_admin.deny_audit_mutation();
drop trigger if exists hub_audit_no_truncate on duolplus_admin.hub_audit_log;
create trigger hub_audit_no_truncate before truncate on duolplus_admin.hub_audit_log
  for each statement execute function duolplus_admin.deny_audit_mutation();

-- The bot has no global key/value table (pulsenotify_bot_settings is per server), so the panel adds one for the
-- maintenance flag. The BOT must read key 'maintenance_mode' for the toggle to have any effect.
create table if not exists pulsenotify.pulsenotify_bot_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table pulsenotify.pulsenotify_bot_state enable row level security;
grant select, insert, update on pulsenotify.pulsenotify_bot_state to service_role;

insert into duolplus_admin.hub_products (slug, name, description, icon, status, schema_name)
values ('pulsenotify', 'PulseNotify', 'Discord bot for social-media alerts, billed per server', 'bell', 'active', 'pulsenotify')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Mutation functions: the change AND its audit row commit in one transaction.
-- ---------------------------------------------------------------------------
create or replace function duolplus_admin.mask_email(e text) returns text language sql immutable as $$
  select case when e is null then null
    else left(split_part(e,'@',1),1) || '***@' || split_part(e,'@',2) end $$;

create or replace function duolplus_admin._audit(
  p_admin uuid, p_email text, p_product text, p_action text, p_ttype text, p_tid text,
  p_before jsonb, p_after jsonb, p_ip text, p_ua text, p_reason text) returns void
language sql as $$
  insert into duolplus_admin.hub_audit_log (admin_id, admin_email, product_slug, action, target_type, target_id, before, after, ip, user_agent, reason)
  values (p_admin, p_email, p_product, p_action, p_ttype, p_tid, p_before, p_after, p_ip, p_ua, p_reason) $$;

-- Billing / guild changes. p_op: extend_trial | adjust_paid | whitelist | unwhitelist | mark_bot_removed
create or replace function duolplus_admin.pn_billing_change(
  p_op text, p_guild bigint, p_days int, p_note text,
  p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  snap_b jsonb; snap_a jsonb;
  b_trial timestamptz; b_paid timestamptz; b_wl boolean; b_note text;
begin
  if p_op = 'mark_bot_removed' then
    select jsonb_build_object('bot_present', bot_present) into snap_b
      from pulsenotify.pulsenotify_guilds where guild_id = p_guild for update;
    if snap_b is null then raise exception 'guild not found'; end if;
    update pulsenotify.pulsenotify_guilds set bot_present = false where guild_id = p_guild;
    snap_a := jsonb_build_object('bot_present', false);
  else
    select trial_ends_at, paid_until, whitelisted, whitelist_note into b_trial, b_paid, b_wl, b_note
      from pulsenotify.pulsenotify_billing where guild_id = p_guild for update;
    if not found then raise exception 'billing row not found'; end if;
    snap_b := jsonb_build_object('trial_ends_at', b_trial, 'paid_until', b_paid,
                                 'whitelisted', b_wl, 'whitelist_note', b_note);
    if p_op = 'extend_trial' then
      update pulsenotify.pulsenotify_billing
        set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days)
        where guild_id = p_guild;
    elsif p_op = 'adjust_paid' then
      update pulsenotify.pulsenotify_billing
        set paid_until = (case when p_days >= 0 then greatest(coalesce(paid_until, now()), now())
                               else coalesce(paid_until, now()) end) + make_interval(days => p_days)
        where guild_id = p_guild;
    elsif p_op = 'whitelist' then
      update pulsenotify.pulsenotify_billing
        set whitelisted = true, whitelist_note = left(p_note, 400) || ' (by ' || p_admin_email || ')', whitelisted_at = now()
        where guild_id = p_guild;
    elsif p_op = 'unwhitelist' then
      update pulsenotify.pulsenotify_billing
        set whitelisted = false, whitelist_note = p_note where guild_id = p_guild;
    else
      raise exception 'unknown op %', p_op;
    end if;
    select jsonb_build_object('trial_ends_at', trial_ends_at, 'paid_until', paid_until,
                              'whitelisted', whitelisted, 'whitelist_note', whitelist_note)
      into snap_a from pulsenotify.pulsenotify_billing where guild_id = p_guild;
  end if;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'pulsenotify', 'server.' || p_op, 'server', p_guild::text,
    snap_b, snap_a || jsonb_build_object('days', p_days), p_ip, p_ua, p_reason);
  return snap_a;
end $$;

-- Reminders: resets the counters so the bot's own schedule fires again. Rate limited to once per hour per server.
create or replace function duolplus_admin.pn_reminder_reset(
  p_guild bigint, p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare snap_b jsonb;
begin
  if exists (select 1 from duolplus_admin.hub_audit_log where action = 'reminder.reset' and target_id = p_guild::text
             and at > now() - interval '1 hour') then
    raise exception 'rate_limited: reminder already reset in the last hour';
  end if;
  select jsonb_build_object('reminders_sent', reminders_sent, 'last_reminder_at', last_reminder_at)
    into snap_b from pulsenotify.pulsenotify_billing where guild_id = p_guild for update;
  if snap_b is null then raise exception 'billing row not found'; end if;
  update pulsenotify.pulsenotify_billing set reminders_sent = 0, last_reminder_at = null where guild_id = p_guild;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'pulsenotify', 'reminder.reset', 'server', p_guild::text,
    snap_b, jsonb_build_object('reminders_sent', 0, 'last_reminder_at', null), p_ip, p_ua, p_reason);
  return snap_b;
end $$;

-- Contacts. p_op: optout | optin | delete. Audit stores only a masked address.
create or replace function duolplus_admin.pn_contact_change(
  p_op text, p_user bigint, p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare c_email text; c_opt boolean; snap_b jsonb; snap_a jsonb;
begin
  select email, reminders_opt_out into c_email, c_opt
    from pulsenotify.pulsenotify_user_contacts where discord_user_id = p_user for update;
  if not found then raise exception 'contact not found'; end if;
  snap_b := jsonb_build_object('email', duolplus_admin.mask_email(c_email), 'reminders_opt_out', c_opt);
  if p_op = 'optout' then
    update pulsenotify.pulsenotify_user_contacts set reminders_opt_out = true, opted_out_at = now()
      where discord_user_id = p_user;
    snap_a := jsonb_build_object('email', duolplus_admin.mask_email(c_email), 'reminders_opt_out', true);
  elsif p_op = 'optin' then
    update pulsenotify.pulsenotify_user_contacts set reminders_opt_out = false, opted_out_at = null
      where discord_user_id = p_user;
    snap_a := jsonb_build_object('email', duolplus_admin.mask_email(c_email), 'reminders_opt_out', false);
  elsif p_op = 'delete' then
    delete from pulsenotify.pulsenotify_user_contacts where discord_user_id = p_user;
    snap_a := jsonb_build_object('deleted', true);
  else raise exception 'unknown op %', p_op; end if;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'pulsenotify', 'contact.' || p_op, 'customer', p_user::text,
    snap_b, snap_a, p_ip, p_ua, p_reason);
  return snap_a;
end $$;

-- Maintenance flag. ASSUMES pulsenotify_bot_state(key text primary key, value jsonb). Adjust if the bot's table differs.
create or replace function duolplus_admin.pn_maintenance_set(
  p_enabled boolean, p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare snap_b jsonb;
begin
  select value into snap_b from pulsenotify.pulsenotify_bot_state where key = 'maintenance_mode' for update;
  insert into pulsenotify.pulsenotify_bot_state (key, value) values ('maintenance_mode', to_jsonb(p_enabled))
    on conflict (key) do update set value = excluded.value;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'pulsenotify', 'maintenance.set', 'bot_state', 'maintenance_mode',
    jsonb_build_object('enabled', snap_b), jsonb_build_object('enabled', p_enabled), p_ip, p_ua, p_reason);
  return jsonb_build_object('enabled', p_enabled);
end $$;

-- Admin management (owner only, enforced in the app). p_products: [{"slug":"pulsenotify","role":"admin"}]
create or replace function duolplus_admin.admin_save(
  p_id uuid, p_email text, p_name text, p_role text, p_active boolean, p_products jsonb,
  p_actor uuid, p_actor_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare snap_b jsonb; snap_a jsonb; is_new boolean;
begin
  select jsonb_build_object('role', role, 'active', active, 'products',
      (select coalesce(jsonb_agg(jsonb_build_object('slug', product_slug, 'role', hap.role)), '[]'::jsonb)
         from duolplus_admin.hub_admin_products hap where hap.admin_id = p_id))
    into snap_b from duolplus_admin.hub_admins where id = p_id;
  is_new := snap_b is null;
  if (p_role <> 'owner' or not p_active)
     and exists (select 1 from duolplus_admin.hub_admins where id = p_id and role = 'owner' and active)
     and (select count(*) from duolplus_admin.hub_admins where role = 'owner' and active) <= 1 then
    raise exception 'cannot remove the last active owner';
  end if;
  insert into duolplus_admin.hub_admins (id, email, display_name, role, active, created_by)
    values (p_id, lower(p_email), p_name, p_role, p_active, p_actor)
    on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, active = excluded.active;
  delete from duolplus_admin.hub_admin_products where admin_id = p_id;
  insert into duolplus_admin.hub_admin_products (admin_id, product_slug, role)
    select p_id, x->>'slug', x->>'role' from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) x;
  snap_a := jsonb_build_object('role', p_role, 'active', p_active, 'products', coalesce(p_products, '[]'::jsonb));
  perform duolplus_admin._audit(p_actor, p_actor_email, null, case when is_new then 'admin.create' else 'admin.update' end,
    'admin', p_id::text, snap_b, snap_a, p_ip, p_ua, p_reason);
  return snap_a;
end $$;

revoke execute on all functions in schema duolplus_admin from public, anon, authenticated;
grant execute on all functions in schema duolplus_admin to service_role;
