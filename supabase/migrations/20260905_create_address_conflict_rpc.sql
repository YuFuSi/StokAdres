create or replace function public.create_address_conflict(
  p_conflict_type text,
  p_product_id uuid,
  p_stock_code text,
  p_stock_name text,
  p_address text,
  p_existing_record_id uuid,
  p_existing_stock_code text,
  p_existing_stock_name text,
  p_existing_address text,
  p_existing_carton_count integer,
  p_existing_is_active boolean,
  p_incoming_stock_code text,
  p_incoming_stock_name text,
  p_incoming_barcode text,
  p_incoming_address text,
  p_incoming_carton_count integer,
  p_source text
)
returns public.address_conflicts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conflict_row public.address_conflicts;
  existing_created_at timestamptz;
  existing_updated_at timestamptz;
begin
  if p_stock_code is distinct from p_existing_stock_code
    or p_stock_name is distinct from p_existing_stock_name
    or p_address is distinct from p_existing_address then
    raise exception 'Conflict mevcut kayıt bilgileri tutarsız';
  end if;

  select created_at, updated_at
  into existing_created_at, existing_updated_at
  from public.address_records
  where id = p_existing_record_id;

  insert into public.address_conflicts (
    conflict_type,
    status,
    product_id,
    stock_code,
    stock_name,
    address,
    existing_record_id,
    existing_carton_count,
    existing_is_active,
    existing_created_at,
    existing_updated_at,
    incoming_stock_code,
    incoming_stock_name,
    incoming_barcode,
    incoming_address,
    incoming_carton_count,
    incoming_source
  ) values (
    p_conflict_type,
    'pending',
    p_product_id,
    p_stock_code,
    p_stock_name,
    p_address,
    p_existing_record_id,
    p_existing_carton_count,
    p_existing_is_active,
    existing_created_at,
    existing_updated_at,
    p_incoming_stock_code,
    p_incoming_stock_name,
    p_incoming_barcode,
    p_incoming_address,
    p_incoming_carton_count,
    p_source
  )
  returning * into conflict_row;

  return conflict_row;
end;
$$;

revoke all on function public.create_address_conflict(
  text, uuid, text, text, text, uuid, text, text, text, integer, boolean,
  text, text, text, text, integer, text
) from public, anon, authenticated;
grant execute on function public.create_address_conflict(
  text, uuid, text, text, text, uuid, text, text, text, integer, boolean,
  text, text, text, text, integer, text
) to anon, authenticated;