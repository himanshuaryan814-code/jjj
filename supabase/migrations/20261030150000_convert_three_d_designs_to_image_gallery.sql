alter table public.three_d_designs
  alter column model_url drop not null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  '3d-designs',
  '3d-designs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Published 3D design assets can be signed"
  on storage.objects;
drop policy if exists "Public can sign published 3D design assets"
  on storage.objects;
drop policy if exists "Admins can sign 3D design assets"
  on storage.objects;
drop policy if exists "Admins can upload 3D design assets"
  on storage.objects;
drop policy if exists "Admins can delete 3D design assets"
  on storage.objects;

create policy "Public can sign published 3D design images"
  on storage.objects
  for select
  to anon
  using (
    bucket_id = '3d-designs'
    and exists (
      select 1
      from public.three_d_designs
      where three_d_designs.status = 'published'
        and three_d_designs.thumbnail_url = storage.objects.name
    )
  );

create policy "Admins can sign 3D design images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = '3d-designs'
    and exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  );

create policy "Admins can upload 3D design images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = '3d-designs'
    and (storage.foldername(name))[1] = 'designs'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  );

create policy "Admins can delete 3D design images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = '3d-designs'
    and exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';
