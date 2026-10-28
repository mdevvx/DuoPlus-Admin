-- Bot settings that used to live only in the bot's environment (price, trial days, grace days) can now be set from
-- the admin panel. They are stored as one JSON value under notify_bot_state key 'bot_settings'. A missing field
-- means "use the bot's own default". The bot reads this key and falls back to its environment per field.
-- Change and audit row share one transaction, like the other dn_* functions.

create or replace function duolplus_admin.dn_bot_setting_save(
  p_key text, p_value jsonb, p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare before_v jsonb;
begin
  if p_key <> 'bot_settings' then raise exception 'unknown setting'; end if;
  select value into before_v from disconotify.notify_bot_state where key = p_key for update;
  insert into disconotify.notify_bot_state (key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify', 'bot.settings.save', 'bot_state', p_key,
    before_v, p_value, p_ip, p_ua, p_reason);
  return p_value;
end $$;

revoke execute on all functions in schema duolplus_admin from public, anon, authenticated;
grant execute on all functions in schema duolplus_admin to service_role;
