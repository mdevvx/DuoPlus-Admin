-- DiscoNotify rename: the bot's schema is now `disconotify` with `notify_*` tables, and the product slug is `disconotify`.
-- Run AFTER the bot's own rename migration. Settings > API > Exposed schemas must include `disconotify`.

-- 1. Product row: new slug, same name/logo/status. Admin assignments move with it; audit rows keep the old slug (append-only).
insert into duolplus_admin.hub_products (slug, name, description, icon, status, schema_name, logo)
  select 'disconotify', name, description, icon, status, 'disconotify', logo from duolplus_admin.hub_products where slug = 'pulsenotify'
  on conflict (slug) do nothing;
update duolplus_admin.hub_admin_products set product_slug = 'disconotify' where product_slug = 'pulsenotify';
delete from duolplus_admin.hub_products where slug = 'pulsenotify';

-- 2. The panel's maintenance flag table lives in the renamed schema.
grant select, insert, update on disconotify.notify_bot_state to service_role;

-- 3. Mutation functions, re-created against the renamed tables (pn_* -> dn_*).
-- Billing / guild changes. p_op: extend_trial | adjust_paid | whitelist | unwhitelist | mark_bot_removed
create or replace function duolplus_admin.dn_billing_change(
  p_op text, p_guild bigint, p_days int, p_note text,
  p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  snap_b jsonb; snap_a jsonb;
  b_trial timestamptz; b_paid timestamptz; b_wl boolean; b_note text;
begin
  if p_op = 'mark_bot_removed' then
    select jsonb_build_object('bot_present', bot_present) into snap_b
      from disconotify.notify_guilds where guild_id = p_guild for update;
    if snap_b is null then raise exception 'guild not found'; end if;
    update disconotify.notify_guilds set bot_present = false where guild_id = p_guild;
    snap_a := jsonb_build_object('bot_present', false);
  else
    select trial_ends_at, paid_until, whitelisted, whitelist_note into b_trial, b_paid, b_wl, b_note
      from disconotify.notify_billing where guild_id = p_guild for update;
    if not found then raise exception 'billing row not found'; end if;
    snap_b := jsonb_build_object('trial_ends_at', b_trial, 'paid_until', b_paid,
                                 'whitelisted', b_wl, 'whitelist_note', b_note);
    if p_op = 'extend_trial' then
      update disconotify.notify_billing
        set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days)
        where guild_id = p_guild;
    elsif p_op = 'adjust_paid' then
      update disconotify.notify_billing
        set paid_until = (case when p_days >= 0 then greatest(coalesce(paid_until, now()), now())
                               else coalesce(paid_until, now()) end) + make_interval(days => p_days)
        where guild_id = p_guild;
    elsif p_op = 'whitelist' then
      update disconotify.notify_billing
        set whitelisted = true, whitelist_note = left(p_note, 400) || ' (by ' || p_admin_email || ')', whitelisted_at = now()
        where guild_id = p_guild;
    elsif p_op = 'unwhitelist' then
      update disconotify.notify_billing
        set whitelisted = false, whitelist_note = p_note where guild_id = p_guild;
    else
      raise exception 'unknown op %', p_op;
    end if;
    select jsonb_build_object('trial_ends_at', trial_ends_at, 'paid_until', paid_until,
                              'whitelisted', whitelisted, 'whitelist_note', whitelist_note)
      into snap_a from disconotify.notify_billing where guild_id = p_guild;
  end if;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify', 'server.' || p_op, 'server', p_guild::text,
    snap_b, snap_a || jsonb_build_object('days', p_days), p_ip, p_ua, p_reason);
  return snap_a;
end $$;

-- Reminders: resets the counters so the bot's own schedule fires again. Rate limited to once per hour per server.
create or replace function duolplus_admin.dn_reminder_reset(
  p_guild bigint, p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare snap_b jsonb;
begin
  if exists (select 1 from duolplus_admin.hub_audit_log where action = 'reminder.reset' and target_id = p_guild::text
             and at > now() - interval '1 hour') then
    raise exception 'rate_limited: reminder already reset in the last hour';
  end if;
  select jsonb_build_object('reminders_sent', reminders_sent, 'last_reminder_at', last_reminder_at)
    into snap_b from disconotify.notify_billing where guild_id = p_guild for update;
  if snap_b is null then raise exception 'billing row not found'; end if;
  update disconotify.notify_billing set reminders_sent = 0, last_reminder_at = null where guild_id = p_guild;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify', 'reminder.reset', 'server', p_guild::text,
    snap_b, jsonb_build_object('reminders_sent', 0, 'last_reminder_at', null), p_ip, p_ua, p_reason);
  return snap_b;
end $$;

-- Contacts. p_op: optout | optin | delete. Audit stores only a masked address.
create or replace function duolplus_admin.dn_contact_change(
  p_op text, p_user bigint, p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare c_email text; c_opt boolean; snap_b jsonb; snap_a jsonb;
begin
  select email, reminders_opt_out into c_email, c_opt
    from disconotify.notify_user_contacts where discord_user_id = p_user for update;
  if not found then raise exception 'contact not found'; end if;
  snap_b := jsonb_build_object('email', duolplus_admin.mask_email(c_email), 'reminders_opt_out', c_opt);
  if p_op = 'optout' then
    update disconotify.notify_user_contacts set reminders_opt_out = true, opted_out_at = now()
      where discord_user_id = p_user;
    snap_a := jsonb_build_object('email', duolplus_admin.mask_email(c_email), 'reminders_opt_out', true);
  elsif p_op = 'optin' then
    update disconotify.notify_user_contacts set reminders_opt_out = false, opted_out_at = null
      where discord_user_id = p_user;
    snap_a := jsonb_build_object('email', duolplus_admin.mask_email(c_email), 'reminders_opt_out', false);
  elsif p_op = 'delete' then
    delete from disconotify.notify_user_contacts where discord_user_id = p_user;
    snap_a := jsonb_build_object('deleted', true);
  else raise exception 'unknown op %', p_op; end if;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify', 'contact.' || p_op, 'customer', p_user::text,
    snap_b, snap_a, p_ip, p_ua, p_reason);
  return snap_a;
end $$;

-- Maintenance flag. ASSUMES notify_bot_state(key text primary key, value jsonb). Adjust if the bot's table differs.
create or replace function duolplus_admin.dn_maintenance_set(
  p_enabled boolean, p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare snap_b jsonb;
begin
  select value into snap_b from disconotify.notify_bot_state where key = 'maintenance_mode' for update;
  insert into disconotify.notify_bot_state (key, value) values ('maintenance_mode', to_jsonb(p_enabled))
    on conflict (key) do update set value = excluded.value;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify', 'maintenance.set', 'bot_state', 'maintenance_mode',
    jsonb_build_object('enabled', snap_b), jsonb_build_object('enabled', p_enabled), p_ip, p_ua, p_reason);
  return jsonb_build_object('enabled', p_enabled);
end $$;


drop function if exists duolplus_admin.pn_billing_change(text, bigint, int, text, uuid, text, text, text, text);
drop function if exists duolplus_admin.pn_reminder_reset(bigint, uuid, text, text, text, text);
drop function if exists duolplus_admin.pn_contact_change(text, bigint, uuid, text, text, text, text);
drop function if exists duolplus_admin.pn_maintenance_set(boolean, uuid, text, text, text, text);

revoke execute on all functions in schema duolplus_admin from public, anon, authenticated;
grant execute on all functions in schema duolplus_admin to service_role;
