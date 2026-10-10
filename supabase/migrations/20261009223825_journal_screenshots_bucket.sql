-- Hand-written: private Storage bucket for journal screenshots (tracker spec §2: private bucket, signed URLs).
-- Only the server (service role) reads and writes it, so no storage policies are granted to users.
-- Guarded so plain-Postgres test databases without the storage schema still migrate.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('journal-screenshots', 'journal-screenshots', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;
