# Adding a product

The shell renders whatever is registered; it never names a product.

1. **Create the folder** `src/products/<slug>/index.ts` exporting a `ProductModule` (see `src/products/types.ts`):
   - `manifest`: `{ slug, name, description, icon, logo? }` (icon is a name from `src/components/icons.tsx`; `logo` is an optional image such as `/products/<slug>.png` placed in `public/products/`, shown in the product switcher and on the Home cards)
   - `navigation`: sidebar items (`label`, `path`, `icon`, optional `permission`, optional `shortcut` for `g` + key)
   - `routes`: path patterns below `/p/<slug>/`, e.g. `''`, `'items'`, `'items/:id'`, each with a `permission` and a `render(ctx)`
   - optional: `headline()` (3 numbers for the Home card), `attention()`, `health()`, `search(q)` (command palette), `exports`
2. **Register it** by adding it to the `MODULES` array in `src/products/registry.ts`.
3. **Add a row** to `duolplus_admin.hub_products`:
   ```sql
   insert into duolplus_admin.hub_products (slug, name, description, icon, status, schema_name)
   values ('acme', 'Acme', 'What it is', 'box', 'active', 'acme');
   ```
4. **Assign admins** in the Admins page (owners see every product automatically).
5. **Mutations** must: call `requireAdmin({ product, permission })`, validate with zod, use `ensureStepUp` for dangerous
   permissions (add them to `DANGEROUS` in `src/lib/roles.ts`), and write the change plus its audit row in one SQL function
   in `duolplus_admin` (copy the `pn_*` functions in the migration).
6. Expose the product's Postgres schema under Settings > API > Exposed schemas.

The sidebar, switcher, Home cards, command palette, CSV export route and permissions need no change.
