-- Run once in Supabase → SQL Editor if deletes from werkelijk.html fail (RLS / permission denied).
-- If a policy with this name already exists: drop policy "anon_delete_Realiteit" on public."Realiteit";
-- If your table is lowercase in SQL: use on public.realiteit instead of public."Realiteit".

create policy "anon_delete_Realiteit"
on public."Realiteit"
for delete
to anon
using (true);
