-- Run in Supabase SQL Editor if «Regel aanpassen» on werkelijk-product.html fails (RLS / permission denied).
-- If policy exists: drop policy "anon_update_Realiteit" on public."Realiteit";

create policy "anon_update_Realiteit"
on public."Realiteit"
for update
to anon
using (true)
with check (true);
