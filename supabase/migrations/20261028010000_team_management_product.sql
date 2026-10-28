-- Registers the Team Management System (the DuoPlus app) as a product in the hub.
-- Its data is read over the app's operator API, so schema_name is only a placeholder.
-- After applying: give admins access to it in the Admins page (owners see every product automatically).
insert into duolplus_admin.hub_products (slug, name, description, icon, status, schema_name)
values ('team-management', 'Team Management System', 'Workspaces, subscriptions and the billing whitelist', 'workspace', 'active', 'none')
on conflict (slug) do nothing;
