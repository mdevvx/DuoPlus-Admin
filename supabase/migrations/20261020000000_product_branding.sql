-- Per-product branding: admins can change a product's display name and logo from its Settings page.
-- The logo is a small raster image stored inline as a data URL (validated and size-limited by the app).
alter table duolplus_admin.hub_products add column if not exists logo text;
