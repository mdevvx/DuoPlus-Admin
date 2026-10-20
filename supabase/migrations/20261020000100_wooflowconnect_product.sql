-- Registers WooFlowConnect (WordPress plugin + licence server) as a product in the hub.
-- Its data is read over the licence server's HTTP API, so schema_name is only a placeholder.
insert into duolplus_admin.hub_products (slug, name, description, icon, status, schema_name)
values ('wooflowconnect', 'WooFlowConnect', 'WooCommerce automation plugin, licensed and billed per store', 'plug', 'active', 'none')
on conflict (slug) do nothing;
