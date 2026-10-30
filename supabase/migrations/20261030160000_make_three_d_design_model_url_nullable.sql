begin;

alter table public.three_d_designs
  alter column model_url drop not null;

notify pgrst, 'reload schema';

commit;
