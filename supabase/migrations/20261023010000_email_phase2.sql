-- Email section, phase 2: manual sends, outbox actions and contact changes.
-- As with the other dn_* functions, each change and its audit row share one transaction.

-- Queue manual emails (one outbox row per recipient). Tests go to the admin's own address.
-- Limits: 200 manual recipients per admin per hour; 5 tests per admin per 10 minutes.
create or replace function duolplus_admin.dn_email_send(
  p_rows jsonb, p_test boolean, p_summary jsonb, p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare n int := jsonb_array_length(p_rows); used int;
begin
  if n = 0 then raise exception 'There is nobody to send to.'; end if;
  if p_test then
    select count(*) into used from disconotify.notify_email_outbox
     where created_by = p_admin_email and kind = 'manual' and created_at > now() - interval '10 minutes' and coalesce(subject_override, '') like '[TEST] %';
    if used + n > 5 then raise exception 'rate_limited: You can send 5 test emails per 10 minutes. Try again shortly.'; end if;
  else
    select count(*) into used from disconotify.notify_email_outbox
     where created_by = p_admin_email and kind = 'manual' and created_at > now() - interval '1 hour' and coalesce(subject_override, '') not like '[TEST] %';
    if used + n > 200 then raise exception 'rate_limited: Manual sends are limited to 200 recipients per hour (% already used).', used; end if;
  end if;

  insert into disconotify.notify_email_outbox (to_email, guild_id, template_key, kind, variables, subject_override, body_html, body_text, send_after, created_by)
  select lower(r.to_email), r.guild_id, r.template_key, 'manual', coalesce(r.variables, '{}'::jsonb), r.subject_override, r.body_html, r.body_text, coalesce(r.send_after, now()), p_admin_email
    from jsonb_to_recordset(p_rows) as r(to_email text, guild_id bigint, template_key text, variables jsonb, subject_override text, body_html text, body_text text, send_after timestamptz);

  if not p_test then
    perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify', 'email.send', 'email_batch', p_summary ->> 'batch',
      null, p_summary || jsonb_build_object('recipients', n), p_ip, p_ua, p_reason);
  end if;
  return jsonb_build_object('queued', n);
end $$;

-- Outbox actions. p_op: retry | cancel | cancel_batch (p_id is then the batch id kept in variables.batch)
create or replace function duolplus_admin.dn_email_outbox_change(
  p_op text, p_id text, p_admin uuid, p_admin_email text, p_ip text, p_ua text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare n int;
begin
  if p_op = 'retry' then
    update disconotify.notify_email_outbox set status = 'queued', attempts = 0, send_after = now() where id::text = p_id and status = 'failed';
  elsif p_op = 'cancel' then
    update disconotify.notify_email_outbox set status = 'skipped', status_detail = 'cancelled by ' || p_admin_email where id::text = p_id and status = 'queued';
  elsif p_op = 'cancel_batch' then
    update disconotify.notify_email_outbox set status = 'skipped', status_detail = 'cancelled by ' || p_admin_email
     where variables ->> 'batch' = p_id and status = 'queued' and created_by = p_admin_email;
  else
    raise exception 'unknown operation';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nothing to change. The email may already have been picked up by the bot.'; end if;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify', 'email.outbox.' || case p_op when 'retry' then 'retry' else 'cancel' end,
    'email_outbox', p_id, null, jsonb_build_object('op', p_op, 'rows', n), p_ip, p_ua, null);
  return jsonb_build_object('changed', n);
end $$;

-- Contact changes. p_op: add | remove | resubscribe | unsubscribe | erase.
-- Audit rows keep only a masked address. `erase` removes the address everywhere (contacts and outbox rows).
create or replace function duolplus_admin.dn_email_contact_change(
  p_op text, p_id text, p_guild bigint, p_email text, p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare addr text; g bigint; n int := 0;
begin
  if p_op = 'add' then
    addr := lower(trim(p_email));
    if addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That is not a valid email address.'; end if;
    if exists (select 1 from disconotify.notify_email_contacts where guild_id = p_guild and lower(email) = addr) then raise exception 'That address is already a contact of this server.'; end if;
    insert into disconotify.notify_email_contacts (guild_id, email, source) values (p_guild, addr, 'manual');
    g := p_guild;
  elsif p_op = 'erase' then
    addr := lower(trim(p_email));
    delete from disconotify.notify_email_contacts where lower(email) = addr;
    get diagnostics n = row_count;
    delete from disconotify.notify_email_outbox where lower(to_email) = addr;
  else
    select lower(email), guild_id into addr, g from disconotify.notify_email_contacts where id::text = p_id for update;
    if not found then raise exception 'contact not found'; end if;
    if p_op = 'remove' then delete from disconotify.notify_email_contacts where id::text = p_id;
    elsif p_op = 'resubscribe' then update disconotify.notify_email_contacts set marketing_unsubscribed_at = null where id::text = p_id;
    elsif p_op = 'unsubscribe' then update disconotify.notify_email_contacts set marketing_unsubscribed_at = now() where id::text = p_id;
    else raise exception 'unknown operation';
    end if;
  end if;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify', 'email.contact.' || p_op, 'email_contact', coalesce(g::text, 'all'),
    null, jsonb_build_object('email', duolplus_admin.mask_email(addr), 'contacts_deleted', n), p_ip, p_ua, p_reason);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on all functions in schema duolplus_admin from public, anon, authenticated;
grant execute on all functions in schema duolplus_admin to service_role;
