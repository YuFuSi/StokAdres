drop policy if exists address_conflicts_public_delete on public.address_conflicts;
create policy address_conflicts_public_delete
on public.address_conflicts
for delete
to anon, authenticated
using (true);
