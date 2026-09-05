create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  product_id uuid references public.products(id) on delete set null,
  stock_code text,
  stock_name text,
  description text not null,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  operation_id uuid,
  user_id uuid,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_check check (action in (
    'product-created', 'product-updated',
    'address-created', 'address-updated', 'address-activated', 'address-deactivated', 'address-deleted',
    'import-completed', 'export-completed', 'backup-created', 'backup-restored', 'data-cleared',
    'conflict-created', 'conflict-kept-existing', 'conflict-replaced', 'conflict-ignored'
  )),
  constraint audit_logs_entity_type_check check (entity_type in (
    'product', 'address_record', 'import', 'export', 'backup', 'conflict', 'system'
  ))
);

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_product_id_idx on public.audit_logs(product_id);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index if not exists audit_logs_action_idx on public.audit_logs(action);
create index if not exists audit_logs_operation_id_idx on public.audit_logs(operation_id);

alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_public_select on public.audit_logs;
drop policy if exists audit_logs_public_insert on public.audit_logs;
drop policy if exists audit_logs_public_update on public.audit_logs;
drop policy if exists audit_logs_public_delete on public.audit_logs;
create policy audit_logs_public_select on public.audit_logs for select to anon, authenticated using (true);

create or replace function public.audit_operation_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.operation_id', true), '')::uuid;
$$;

create or replace function public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_product_id uuid,
  p_stock_code text,
  p_stock_name text,
  p_description text,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_operation_id uuid default public.audit_operation_id()
)
returns public.audit_logs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
  declare result public.audit_logs;
  begin
    insert into public.audit_logs (
      action, entity_type, entity_id, product_id, stock_code, stock_name,
      description, old_data, new_data, metadata, operation_id, user_id
    ) values (
      p_action, p_entity_type, p_entity_id, p_product_id, p_stock_code, p_stock_name,
      p_description, p_old_data, p_new_data, coalesce(p_metadata, '{}'::jsonb),
      p_operation_id, auth.uid()
    ) returning * into result;
    return result;
  end;
$$;

revoke all on function public.write_audit_log(text, text, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;

create or replace function public.audit_products_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'product-created', 'product', new.id, new.id, new.stock_code, new.stock_name,
      new.stock_code || ' ürünü oluşturuldu.', null,
      jsonb_build_object('stock_code', new.stock_code, 'stock_name', new.stock_name, 'barcode', new.barcode), '{}'::jsonb
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and (old.stock_code, old.stock_name, old.barcode) is distinct from (new.stock_code, new.stock_name, new.barcode) then
    perform public.write_audit_log(
      'product-updated', 'product', new.id, new.id, new.stock_code, new.stock_name,
      new.stock_code || ' ürünü güncellendi.',
      jsonb_build_object('stock_code', old.stock_code, 'stock_name', old.stock_name, 'barcode', old.barcode),
      jsonb_build_object('stock_code', new.stock_code, 'stock_name', new.stock_name, 'barcode', new.barcode), '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

create or replace function public.clear_address_records(p_operation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare deleted_count integer;
begin
  perform set_config('app.operation_id', p_operation_id::text, true);
  perform set_config('app.suppress_address_delete_audit', 'on', true);
  delete from public.address_records;
  get diagnostics deleted_count = row_count;
  perform public.write_audit_log('data-cleared', 'system', null, null, null, null, 'Adres verileri temizlendi.', null, null, jsonb_build_object('deleted_record_count', deleted_count), p_operation_id);
  return deleted_count;
end;
$$;
revoke all on function public.clear_address_records(uuid) from public;
grant execute on function public.clear_address_records(uuid) to anon, authenticated;

create or replace function public.restore_address_records(p_records jsonb, p_operation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare restored_count integer;
begin
  perform set_config('app.operation_id', p_operation_id::text, true);
  perform set_config('app.suppress_address_delete_audit', 'on', true);
  perform set_config('app.suppress_address_audit', 'on', true);
  delete from public.address_records;
  insert into public.address_records (id, product_id, address, carton_count, is_active, created_at, updated_at)
  select "id", "productId", address, "cartonCount", "isActive", "createdAt", "updatedAt"
  from jsonb_to_recordset(p_records) as records(
    "id" uuid,
    "productId" uuid,
    address text,
    "cartonCount" integer,
    "isActive" boolean,
    "createdAt" timestamptz,
    "updatedAt" timestamptz
  );
  get diagnostics restored_count = row_count;
  perform public.write_audit_log('backup-restored', 'backup', null, null, null, null, 'Backup geri yüklendi.', null, null, jsonb_build_object('restored_record_count', restored_count), p_operation_id);
  return restored_count;
end;
$$;
revoke all on function public.restore_address_records(jsonb, uuid) from public;
grant execute on function public.restore_address_records(jsonb, uuid) to anon, authenticated;

create or replace function public.audit_address_records_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare product_row record; action_name text; description_text text; old_snapshot jsonb; new_snapshot jsonb;
begin
  if current_setting('app.suppress_address_audit', true) = 'on' then return new; end if;
  if tg_op = 'DELETE' then
    if current_setting('app.suppress_address_delete_audit', true) = 'on' then return old; end if;
    select stock_code, stock_name into product_row from public.products where id = old.product_id;
    perform public.write_audit_log('address-deleted', 'address_record', old.id, old.product_id, product_row.stock_code, product_row.stock_name, coalesce(product_row.stock_code, '') || ' adresi ' || old.address || ' silindi.', jsonb_build_object('address', old.address, 'carton_count', old.carton_count, 'is_active', old.is_active), null, '{}'::jsonb);
    return old;
  end if;
  select stock_code, stock_name into product_row from public.products where id = new.product_id;
  old_snapshot := case when tg_op = 'UPDATE' then jsonb_build_object('address', old.address, 'carton_count', old.carton_count, 'is_active', old.is_active) end;
  new_snapshot := jsonb_build_object('address', new.address, 'carton_count', new.carton_count, 'is_active', new.is_active);
  if tg_op = 'INSERT' then action_name := 'address-created'; description_text := coalesce(product_row.stock_code, '') || ' adresine ' || new.address || ' eklendi.';
  elsif old.is_active is distinct from new.is_active and (old.address, old.carton_count) is not distinct from (new.address, new.carton_count) then action_name := case when new.is_active then 'address-activated' else 'address-deactivated' end; description_text := coalesce(product_row.stock_code, '') || ' adresi ' || case when new.is_active then 'aktif' else 'pasif' end || ' yapıldı.';
  elsif (old.address, old.carton_count, old.product_id) is distinct from (new.address, new.carton_count, new.product_id) then action_name := 'address-updated'; description_text := coalesce(product_row.stock_code, '') || ' adres kaydı güncellendi.';
  else return new; end if;
  perform public.write_audit_log(action_name, 'address_record', new.id, new.product_id, product_row.stock_code, product_row.stock_name, description_text, old_snapshot, new_snapshot, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists products_audit_trigger on public.products;
create trigger products_audit_trigger
after insert or update on public.products
for each row execute function public.audit_products_trigger();

drop trigger if exists address_records_audit_trigger on public.address_records;
create trigger address_records_audit_trigger
after insert or update or delete on public.address_records
for each row execute function public.audit_address_records_trigger();

create or replace function public.audit_conflicts_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'conflict-created',
      'conflict',
      new.id,
      new.product_id,
      new.stock_code,
      new.stock_name,
      new.stock_code || ' için adres çakışması oluşturuldu.',
      jsonb_build_object('existing_carton_count', new.existing_carton_count),
      jsonb_build_object('incoming_address', new.incoming_address, 'incoming_carton_count', new.incoming_carton_count),
      jsonb_build_object('incoming_source', new.incoming_source)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists address_conflicts_audit_trigger on public.address_conflicts;
create trigger address_conflicts_audit_trigger
after insert on public.address_conflicts
for each row execute function public.audit_conflicts_trigger();

create or replace function public.resolve_address_conflict(conflict_id uuid, action text, p_operation_id uuid default gen_random_uuid())
returns public.address_conflicts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare conflict_row public.address_conflicts; replacement_id uuid;
begin
  select * into conflict_row from public.address_conflicts where id = conflict_id and status = 'pending' for update;
  if not found then raise exception 'Conflict bulunamadı veya zaten çözüldü'; end if;
  perform set_config('app.operation_id', p_operation_id::text, true);
  if action = 'replace-with-incoming' then
    if conflict_row.product_id is null then raise exception 'Conflict ilişkili ürün olmadan çözülemiyor'; end if;
    if conflict_row.existing_record_id is not null then update public.address_records set is_active = false where id = conflict_row.existing_record_id; end if;
    insert into public.address_records (product_id, address, carton_count, is_active) values (conflict_row.product_id, conflict_row.incoming_address, conflict_row.incoming_carton_count, true) returning id into replacement_id;
    update public.address_conflicts set status = 'resolved', resolution = 'replace-with-incoming', resolved_at = now() where id = conflict_id;
    perform public.write_audit_log('conflict-replaced', 'conflict', conflict_id, conflict_row.product_id, conflict_row.stock_code, conflict_row.stock_name, conflict_row.stock_code || ' conflict kaydı incoming kayıtla değiştirildi.', jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'resolved', 'resolution', 'replace-with-incoming'), jsonb_build_object('replacement_record_id', replacement_id), p_operation_id);
  elsif action = 'keep-existing' then
    update public.address_conflicts set status = 'resolved', resolution = 'keep-existing', resolved_at = now() where id = conflict_id;
    perform public.write_audit_log('conflict-kept-existing', 'conflict', conflict_id, conflict_row.product_id, conflict_row.stock_code, conflict_row.stock_name, conflict_row.stock_code || ' conflict kaydında mevcut kayıt korundu.', jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'resolved', 'resolution', 'keep-existing'), '{}'::jsonb, p_operation_id);
  elsif action = 'ignored' then
    update public.address_conflicts set status = 'ignored', resolution = 'ignored', resolved_at = now() where id = conflict_id;
    perform public.write_audit_log('conflict-ignored', 'conflict', conflict_id, conflict_row.product_id, conflict_row.stock_code, conflict_row.stock_name, conflict_row.stock_code || ' conflict kaydı yoksayıldı.', jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'ignored', 'resolution', 'ignored'), '{}'::jsonb, p_operation_id);
  else raise exception 'Geçersiz conflict çözüm aksiyonu'; end if;
  select * into conflict_row from public.address_conflicts where id = conflict_id; return conflict_row;
end;
$$;
revoke all on function public.resolve_address_conflict(uuid, text, uuid) from public;
grant execute on function public.resolve_address_conflict(uuid, text, uuid) to anon, authenticated;

-- Existing installations should use this replacement for the previous two-argument RPC.
drop function if exists public.resolve_address_conflict(uuid, text);
