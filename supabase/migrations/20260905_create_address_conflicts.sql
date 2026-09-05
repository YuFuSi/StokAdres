create table if not exists public.address_conflicts (
  id uuid primary key default gen_random_uuid(),
  conflict_type text not null default 'address-duplicate',
  status text not null default 'pending',
  product_id uuid references public.products(id) on delete set null,
  stock_code text not null,
  stock_name text not null,
  address text not null,
  existing_record_id uuid references public.address_records(id) on delete set null,
  existing_carton_count integer,
  existing_is_active boolean,
  existing_created_at timestamptz,
  existing_updated_at timestamptz,
  incoming_stock_code text not null,
  incoming_stock_name text not null,
  incoming_barcode text,
  incoming_address text not null,
  incoming_carton_count integer not null,
  incoming_source text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  resolved_by uuid,
  constraint address_conflicts_type_check check (conflict_type in ('address-duplicate')),
  constraint address_conflicts_status_check check (status in ('pending', 'resolved', 'ignored')),
  constraint address_conflicts_resolution_check check (resolution is null or resolution in ('keep-existing', 'replace-with-incoming', 'ignored'))
);

create index if not exists idx_address_conflicts_status on public.address_conflicts(status);
create index if not exists idx_address_conflicts_product_id on public.address_conflicts(product_id);
create index if not exists idx_address_conflicts_created_at on public.address_conflicts(created_at desc);

alter table public.address_conflicts enable row level security;

drop policy if exists address_conflicts_public_select on public.address_conflicts;
drop policy if exists address_conflicts_public_insert on public.address_conflicts;
drop policy if exists address_conflicts_public_update on public.address_conflicts;
drop policy if exists address_conflicts_public_delete on public.address_conflicts;
create policy address_conflicts_public_select on public.address_conflicts for select to anon, authenticated using (true);
create policy address_conflicts_public_insert on public.address_conflicts for insert to anon, authenticated with check (true);
create policy address_conflicts_public_update on public.address_conflicts for update to anon, authenticated using (true) with check (true);
create policy address_conflicts_public_delete on public.address_conflicts for delete to anon, authenticated using (true);

create or replace function public.resolve_address_conflict(conflict_id uuid, action text)
returns public.address_conflicts
language plpgsql
security invoker
set search_path = public
as $$
declare
  conflict_row public.address_conflicts;
  replacement_id uuid;
begin
  select * into conflict_row
  from public.address_conflicts
  where id = conflict_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Conflict bulunamadı veya zaten çözüldü';
  end if;

  if action = 'replace-with-incoming' then
    if conflict_row.product_id is null then
      raise exception 'Conflict ilişkili ürün olmadan çözülemiyor';
    end if;

    if conflict_row.existing_record_id is not null then
      update public.address_records
      set is_active = false
      where id = conflict_row.existing_record_id;
    end if;

    insert into public.address_records (product_id, address, carton_count, is_active)
    values (
      conflict_row.product_id,
      conflict_row.incoming_address,
      conflict_row.incoming_carton_count,
      true
    )
    returning id into replacement_id;

    update public.address_conflicts
    set status = 'resolved',
        resolution = 'replace-with-incoming',
        resolved_at = now()
    where id = conflict_id;
  elsif action = 'keep-existing' then
    update public.address_conflicts
    set status = 'resolved',
        resolution = 'keep-existing',
        resolved_at = now()
    where id = conflict_id;
  elsif action = 'ignored' then
    update public.address_conflicts
    set status = 'ignored',
        resolution = 'ignored',
        resolved_at = now()
    where id = conflict_id;
  else
    raise exception 'Geçersiz conflict çözüm aksiyonu';
  end if;

  select * into conflict_row from public.address_conflicts where id = conflict_id;
  return conflict_row;
end;
$$;

grant execute on function public.resolve_address_conflict(uuid, text) to anon, authenticated;
