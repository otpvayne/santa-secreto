-- Santa Secreto — endurecimiento para Supabase
-- La aplicación accede a la base de datos SOLO desde el servidor (conexión directa / pooler).
-- Nada del esquema `santa` debe ser accesible con las claves públicas de Supabase.

-- RLS activado sin políticas: cualquier rol que no sea dueño de las tablas queda bloqueado.
alter table santa.events             enable row level security;
alter table santa.participants       enable row level security;
alter table santa.assignments        enable row level security;
alter table santa.draw_cards         enable row level security;
alter table santa.delivery_turns     enable row level security;
alter table santa.audit_logs         enable row level security;
alter table santa.sessions           enable row level security;
alter table santa.presentation_codes enable row level security;
alter table santa.rate_limits        enable row level security;

revoke all on all functions in schema santa from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema santa from anon, authenticated';
    execute 'revoke all on all tables in schema santa from anon, authenticated';
    execute 'revoke all on all sequences in schema santa from anon, authenticated';
    execute 'revoke all on all functions in schema santa from anon, authenticated';
    execute 'alter default privileges in schema santa revoke all on tables from anon, authenticated';
    execute 'alter default privileges in schema santa revoke all on functions from anon, authenticated';
  end if;
end $$;

-- Bucket PRIVADO para fotografías (solo WebP: el servidor convierte todas las imágenes).
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('participant-photos', 'participant-photos', false, 2097152, array['image/webp'])
      on conflict (id) do update set public = false
    $sql$;
  end if;
end $$;
