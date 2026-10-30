# Tarangan Associates — static deployment package

This is the existing plain HTML, CSS, and JavaScript website. The admin panel is a separate static page under `/admin`; the public site and its design remain in place.

## Supabase configuration

1. Open `supabase-config.js` and set `url` to the existing Supabase project URL and `anonKey` to that project's **publishable/anon key**.
2. Never put a `service_role` key in this file or in browser code.
3. Sign in at `/admin/` using an existing Supabase Auth user whose UUID has a matching `user_id` row in `public.admin_users`. The panel does not provide public sign-up. The authenticated user must be allowed to select their own matching row through the table's existing RLS policies.
4. The admin panel uses the existing `upcoming_projects` and `leads` tables. Project fields used by the panel are `id`, `title`, `description`, `location`, `image_url`, `status`, `category`, and `is_published`. Uploaded project images are saved in the dedicated `project-images` Storage bucket; their public URL is stored in the existing `image_url` column. Lead inserts map the public forms to `client_name`, `email`, `phone`, `location`, `project_type`, `work_scope`, `budget`, `start_timeline`, `details`, and `lead_status`; optional budget/details are omitted when blank. The admin reads the existing `leads` rows and updates `lead_status` by `id`.

`supabase-config.js` contains the project's URL and a browser-safe publishable key. The browser must never contain a `service_role` key. Database Row Level Security must allow an authenticated admin to read their own `admin_users.user_id` row, allow approved lead submissions, restrict lead reads/status updates and project writes to authorized admins, and allow public reads only for published projects. The Storage bucket must be publicly readable for the existing unauthenticated website to display its images, while uploads and deletions remain admin-only. Do not apply the SQL below until you have reviewed and approved it. No database schema, users, buckets, or policies are changed by this code.

### 3D Designs setup

The 3D Designs feature is an image-only gallery backed by the existing Supabase project and `public.admin_users` authorization pattern. SQL is not run by the website code.

1. For a new installation, run [`supabase/migrations/20261030140000_create_three_d_designs.sql`](./supabase/migrations/20261030140000_create_three_d_designs.sql) to create the table and database policies, then run [`supabase/setup-3d-designs-storage.sql`](./supabase/setup-3d-designs-storage.sql) to configure Storage. The initial table migration already makes `model_url` nullable.
2. For an existing table that still rejects a missing model URL, run [`supabase/migrations/20261030160000_make_three_d_design_model_url_nullable.sql`](./supabase/migrations/20261030160000_make_three_d_design_model_url_nullable.sql). It only drops the `NOT NULL` constraint on `model_url`; it does not recreate the table or change any rows. It is safe to run if the column is already nullable.
3. To convert an existing original installation to the image gallery and configure its Storage bucket, run [`supabase/migrations/20261030150000_convert_three_d_designs_to_image_gallery.sql`](./supabase/migrations/20261030150000_convert_three_d_designs_to_image_gallery.sql). This migration already makes `model_url` nullable, preserves rows, configures the bucket, and replaces the 3D asset access policies with published-image policies. It does not delete old model files; do not also run the Storage setup script after this migration. The dedicated `20261030160000` migration may also be run afterward; its nullable change is idempotent.
4. If the table is missing, first run the table-creation migration, then run the image-gallery migration (which also configures Storage). The Storage setup script is only needed for a new installation.
5. Confirm the signed-in administrator has a `public.admin_users.user_id` row and can read that row under the table's existing RLS policy. No service-role key or other secret is needed in the browser.
6. Open `/admin/`, sign in, and use **3D Designs** to add and publish designs. Each entry requires one JPG, JPEG, PNG or WebP image up to 10 MB. The public homepage fetches only published rows and displays their images through short-lived signed URLs.

Review the SQL and existing 3D-specific policies before running. The migration replaces only policies for objects in the `3d-designs` bucket; it does not change Leads, Upcoming Projects, or their policies. Existing database rows and Storage objects are retained.

### Proposed Storage setup — review and approve before running

This setup creates a 5 MB public-read bucket restricted to JPEG, PNG and WebP files, and adds authenticated-admin-only upload and delete policies. Public read access is necessary because the existing website displays project images without a visitor login. These proposed Storage policies check `app_metadata.role`, not `public.admin_users`; they will not authorize a table-listed admin unless that claim is also configured. Reconcile that criterion with the existing secure Storage policies before applying anything. The policies do not grant public uploads, updates, or deletes. The insert leaves an already-existing bucket unchanged; verify its existing settings before use. Also inspect any existing `storage.objects` policies first, because permissive policies combine with new policies and could broaden access.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-images',
  'project-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

create policy "tarangan_project_images_admin_insert_v1"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-images'
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

create policy "tarangan_project_images_admin_delete_v1"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-images'
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);
```

The SQL above has not been run. Review the existing Storage bucket and RLS policies in Supabase before applying it. Policy names must be unused. If your existing policies already provide equivalent or broader access, reconcile them rather than adding duplicate or conflicting policies. No `image_url` schema change is expected based on the existing project code. Live schema metadata was not accessible from this workspace, so verify the current database defaults and policies in Supabase before relying on them.

## Public lead forms and calculators

The contact form, consultation/call enquiry, and estimator access form submit through the same Supabase `leads` insert. They map form values to the existing required columns `client_name`, `email`, `phone`, `location`, `project_type`, `work_scope`, `start_timeline`, and `lead_status`, with optional `budget` and `details`. The calculator is revealed only after its lead insert succeeds; failed submissions keep the form values available for retry. No table, column, or policy changes are made by the frontend.

For public submissions, configure Supabase Row Level Security to permit only the intended `INSERT` fields for `anon` and `authenticated` roles. Do not grant public `SELECT` on `leads`; lead reads and status updates remain restricted to authorized admins. The configured URL and publishable key are present, but live submissions still depend on the existing policies.

## Run locally

From this folder, run:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/admin/`. A static file server is required; opening the HTML file directly will not reliably load the project scripts or routes. Check the browser console and dashboard notices for Supabase configuration, authentication, or RLS errors.

## Deployment

The site is static and does not need a build step. Deploy the contents of this folder as the site root. Netlify routing sends `/admin` and `/admin/*` to `admin/index.html`, while preserving the existing public-site fallback. `vercel.json` is intentionally not included; add deployment-specific routing only if the chosen host demonstrably requires it.

## Existing site assets

- `index.html` — public website shell
- `app.js` — page renderer, hash navigation, interactions, published project loading, and the eight professional service detail routes (`/#/services/<slug>`)
- `styles.css` — existing public-site styles
- `admin/` — admin login and dashboard
- `public/Real-Estate-video-SnapYT.App.mp4` — hero video
- `public/design-concepts/` — locally stored illustrative residential, kitchen and bedroom reference photographs sourced from Unsplash

The eight professional services each have a distinct detail page with service-specific capabilities, process steps, related links and a four-image gallery. Service gallery photographs are illustrative references from Pexels, Unsplash and the local design-concept assets; they are not represented as verified Tarangan Associates projects. External imagery remains subject to its provider's license.

The three featured design concept cards and their detail galleries share the concept data in `app.js`; each uses its own four local images. These are illustrative references, not verified Tarangan Associates project photographs. Unsplash images are used under the [Unsplash License](https://unsplash.com/license).

The Products & Materials overview and its six detail routes are defined in `app.js`. The shared `MATERIAL_CATEGORIES` mapping supplies each category card, detail-page feature image, gallery, alt text, and gallery caption. Its local image assets are served from `public/design-concepts/`. Kitchen Finishes, Cabinetry & Shutters, Countertop Materials, Flooring Materials, Wall Finishes & Panels, and Lighting Concepts use category-relevant illustrative references, not verified completed projects.
