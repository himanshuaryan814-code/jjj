create table if not exists public.three_d_designs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  description text not null default '',
  thumbnail_url text,
  model_url text,
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  is_featured boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists three_d_designs_published_order_idx
  on public.three_d_designs (display_order, created_at desc)
  where status = 'published';

alter table public.three_d_designs enable row level security;

grant select on public.three_d_designs to anon, authenticated;
grant insert, update, delete on public.three_d_designs to authenticated;

create policy "Public can read published 3D designs"
  on public.three_d_designs
  for select
  to anon, authenticated
  using (status = 'published');

create policy "Admins can read all 3D designs"
  on public.three_d_designs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  );

create policy "Admins can insert 3D designs"
  on public.three_d_designs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  );

create policy "Admins can update 3D designs"
  on public.three_d_designs
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  );

create policy "Admins can delete 3D designs"
  on public.three_d_designs
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  );

create or replace function public.set_three_d_designs_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_three_d_designs_updated_at
  before update on public.three_d_designs
  for each row
  execute function public.set_three_d_designs_updated_at();
