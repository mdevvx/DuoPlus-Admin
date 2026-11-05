-- Free plan: the trial is gone. "Extend trial" is replaced by "Grant paid time" and "Remove paid time".
-- Grants are recorded only in the audit log (action billing.grant_days, metadata {days, reason}) and in
-- notify_billing.paid_until. The payments ledger is never touched, so revenue and MRR stay real.
-- Requires the bot's migration 0015 (notify_guild_plans, notify_dashboard_jobs) for the panel's new pages.
create or replace function duolplus_admin.dn_billing_change(
  p_op text, p_guild bigint, p_days int, p_note text,
  p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  snap_b jsonb; snap_a jsonb;
  b_paid timestamptz; b_wl boolean; b_note text;
  v_action text;
begin
  if p_op = 'mark_bot_removed' then
    select jsonb_build_object('bot_present', bot_present) into snap_b
      from disconotify.notify_guilds where guild_id = p_guild for update;
    if snap_b is null then raise exception 'guild not found'; end if;
    update disconotify.notify_guilds set bot_present = false where guild_id = p_guild;
    snap_a := jsonb_build_object('bot_present', false);
  else
    select paid_until, whitelisted, whitelist_note into b_paid, b_wl, b_note
      from disconotify.notify_billing where guild_id = p_guild for update;
    if not found then raise exception 'billing row not found'; end if;
    snap_b := jsonb_build_object('paid_until', b_paid, 'whitelisted', b_wl, 'whitelist_note', b_note);
    if p_op = 'grant_days' then
      if p_days < 1 or p_days > 365 then raise exception 'days must be between 1 and 365'; end if;
      update disconotify.notify_billing
        set paid_until = greatest(coalesce(paid_until, now()), now()) + make_interval(days => p_days)
        where guild_id = p_guild;
    elsif p_op = 'remove_paid' then
      update disconotify.notify_billing set paid_until = now() where guild_id = p_guild;
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
    select jsonb_build_object('paid_until', paid_until, 'whitelisted', whitelisted, 'whitelist_note', whitelist_note)
      into snap_a from disconotify.notify_billing where guild_id = p_guild;
  end if;
  v_action := case p_op when 'grant_days' then 'billing.grant_days' when 'remove_paid' then 'billing.remove_paid' else 'server.' || p_op end;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify', v_action, 'server', p_guild::text,
    snap_b, snap_a || jsonb_build_object('days', p_days, 'reason', p_reason), p_ip, p_ua, p_reason);
  return snap_a;
end $$;

-- Support actions on one monitored account: pause, resume, remove. Audit-logged in the same transaction.
create or replace function duolplus_admin.dn_account_change(
  p_op text, p_guild bigint, p_account text,
  p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare snap_b jsonb; snap_a jsonb;
begin
  select jsonb_build_object('platform', platform, 'username', username, 'enabled', enabled) into snap_b
    from disconotify.notify_platform_accounts where guild_id = p_guild and id::text = p_account for update;
  if snap_b is null then raise exception 'account not found'; end if;
  if p_op = 'pause' then
    update disconotify.notify_platform_accounts set enabled = false where guild_id = p_guild and id::text = p_account;
    snap_a := snap_b || jsonb_build_object('enabled', false);
  elsif p_op = 'resume' then
    update disconotify.notify_platform_accounts set enabled = true where guild_id = p_guild and id::text = p_account;
    snap_a := snap_b || jsonb_build_object('enabled', true);
  elsif p_op = 'remove' then
    delete from disconotify.notify_platform_accounts where guild_id = p_guild and id::text = p_account;
    snap_a := jsonb_build_object('removed', true);
  else
    raise exception 'unknown op %', p_op;
  end if;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify', 'account.' || p_op, 'server', p_guild::text,
    snap_b, snap_a || jsonb_build_object('account', p_account), p_ip, p_ua, p_reason);
  return snap_a;
end $$;
