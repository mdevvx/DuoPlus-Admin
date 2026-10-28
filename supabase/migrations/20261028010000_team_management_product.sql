-- Registers Donexel (the app formerly called DuoPlus) as a product in the hub.
-- Its data is read over the app's operator API, so schema_name is only a placeholder.
-- After applying: give admins access to it in the Admins page (owners see every product automatically).
insert into duolplus_admin.hub_products (slug, name, description, icon, status, schema_name)
values ('team-management', 'Donexel', 'Workspaces, subscriptions and the billing whitelist', 'workspace', 'active', 'none')
on conflict (slug) do nothing;

-- The product is now called Donexel. Only renames the default name; a name you set yourself under Settings > Branding is kept.
update duolplus_admin.hub_products set name = 'Donexel' where slug = 'team-management' and name = 'Team Management System';
