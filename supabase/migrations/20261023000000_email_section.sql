-- Email section: template edits and email settings. Each change and its audit row share one transaction,
-- like the other dn_* functions. The tables themselves (notify_email_*) are created by the bot's migrations;
-- the database snapshots the old content into notify_email_template_versions and bumps `version` on update.

-- Save a template's content. Optimistic concurrency: p_expected_version must still be the current version.
create or replace function duolplus_admin.dn_email_template_save(
  p_key text, p_expected_version int, p_name text, p_description text, p_subject text, p_preheader text,
  p_html text, p_text text, p_admin uuid, p_admin_email text, p_ip text, p_ua text, p_action text default 'email.template.save') returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare t disconotify.notify_email_templates%rowtype; v int;
begin
  select * into t from disconotify.notify_email_templates where key = p_key for update;
  if not found then raise exception 'template not found'; end if;
  if t.version is distinct from p_expected_version then
    raise exception 'Someone else edited this template (now version %). Reload the page to see their changes.', t.version;
  end if;
  update disconotify.notify_email_templates
     set name = p_name, description = p_description, subject = p_subject, preheader = p_preheader,
         body_html = p_html, body_text = p_text, updated_by = p_admin_email, updated_at = now()
   where key = p_key
  returning version into v;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify', p_action, 'email_template', p_key,
    jsonb_build_object('version', t.version, 'subject', t.subject, 'html_size', length(t.body_html), 'html_md5', md5(t.body_html), 'text_md5', md5(t.body_text), 'html_head', left(t.body_html, 10240)),
    jsonb_build_object('version', v, 'subject', p_subject, 'html_size', length(p_html), 'html_md5', md5(p_html), 'text_md5', md5(p_text), 'html_head', left(p_html, 10240)),
    p_ip, p_ua, null);
  return jsonb_build_object('version', v);
end $$;

-- Switch the automatic emails for a template on or off (manual sends are unaffected).
create or replace function duolplus_admin.dn_email_template_toggle(
  p_key text, p_enabled boolean, p_admin uuid, p_admin_email text, p_ip text, p_ua text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare was boolean;
begin
  select enabled into was from disconotify.notify_email_templates where key = p_key for update;
  if not found then raise exception 'template not found'; end if;
  update disconotify.notify_email_templates set enabled = p_enabled, updated_by = p_admin_email, updated_at = now() where key = p_key;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify', 'email.template.toggle', 'email_template', p_key,
    jsonb_build_object('enabled', was), jsonb_build_object('enabled', p_enabled), p_ip, p_ua, null);
  return jsonb_build_object('enabled', p_enabled);
end $$;

-- Layout and schedule live as JSON in notify_bot_state. Only these two keys can be written through here.
create or replace function duolplus_admin.dn_email_setting_save(
  p_key text, p_value jsonb, p_admin uuid, p_admin_email text, p_ip text, p_ua text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare before_v jsonb;
begin
  if p_key not in ('email_layout', 'email_schedule') then raise exception 'unknown setting'; end if;
  select value into before_v from disconotify.notify_bot_state where key = p_key for update;
  insert into disconotify.notify_bot_state (key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value;
  perform duolplus_admin._audit(p_admin, p_admin_email, 'disconotify',
    case p_key when 'email_layout' then 'email.layout.save' else 'email.schedule.save' end,
    'bot_state', p_key, before_v, p_value, p_ip, p_ua, null);
  return p_value;
end $$;

revoke execute on all functions in schema duolplus_admin from public, anon, authenticated;
grant execute on all functions in schema duolplus_admin to service_role;
