-- Santa Secreto — sugerencias de regalo por participante
--
-- Migración ADITIVA y NO destructiva:
--   * agrega una columna NULLABLE (los registros existentes quedan con NULL, sin reescribir datos);
--   * agrega una función nueva para la actualización masiva desde Excel.
-- No modifica tablas, funciones, asignaciones, tarjetas ni estados existentes.
-- Es segura de ejecutar más de una vez (if not exists / create or replace).

-- ---------------------------------------------------------------------------
-- Columna: texto libre tal como lo escribió la persona (saltos de línea, tildes, emojis…).
-- Pertenece al participante DENTRO de su evento (participants ya está separada por event_id).
-- ---------------------------------------------------------------------------
alter table santa.participants add column if not exists gift_wishes text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'participants_gift_wishes_length'
                    and conrelid = 'santa.participants'::regclass) then
    -- Todas las filas existentes tienen NULL: la validación es inmediata y no bloquea datos.
    alter table santa.participants
      add constraint participants_gift_wishes_length
      check (gift_wishes is null or char_length(gift_wishes) <= 4000);
  end if;
end $$;

comment on column santa.participants.gift_wishes is
  'Sugerencias de regalo en texto libre. NULL = sin sugerencias. Editable por organizadores en cualquier estado salvo ARCHIVED.';

-- ---------------------------------------------------------------------------
-- Actualización masiva de sugerencias (importación desde Excel).
-- Solo toca la columna gift_wishes de participantes EXISTENTES del evento indicado.
-- Nunca inserta, elimina ni cambia identificadores, roles, fotos, asignaciones o estados.
-- p_rows: [{ "id": uuid, "gift_wishes": text }, …]
-- Idempotente: las filas cuyo valor ya es idéntico no se reescriben ni se cuentan.
-- ---------------------------------------------------------------------------
create or replace function santa.update_gift_wishes(p_event uuid, p_actor uuid, p_rows jsonb)
returns int
language plpgsql as $$
declare
  v_event santa.events;
  v_actor text;
  v_total int;
  v_count int;
begin
  v_event := santa.lock_event(p_event);
  v_actor := santa.assert_organizer(p_event, p_actor);
  if v_event.status = 'ARCHIVED' then
    perform santa.fail('EVENT_ARCHIVED');
  end if;

  select count(*)::int into v_total from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(id uuid, gift_wishes text);

  -- Cada fila debe ser un participante de ESTE evento, sin repetidos y con texto no vacío.
  if exists (select 1 from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(id uuid, gift_wishes text)
              where x.id is null or x.gift_wishes is null or btrim(x.gift_wishes) = ''
                 or char_length(x.gift_wishes) > 4000) then
    perform santa.fail('INVALID_INPUT');
  end if;
  if (select count(distinct x.id) from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(id uuid, gift_wishes text))
       <> v_total then
    perform santa.fail('INVALID_INPUT');
  end if;
  if exists (select x.id from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(id uuid, gift_wishes text)
             except select id from santa.participants where event_id = p_event) then
    perform santa.fail('NOT_FOUND');
  end if;

  update santa.participants p
     set gift_wishes = x.gift_wishes
    from jsonb_to_recordset(p_rows) as x(id uuid, gift_wishes text)
   where p.id = x.id and p.event_id = p_event
     and p.gift_wishes is distinct from x.gift_wishes;
  get diagnostics v_count = row_count;

  perform santa.log(p_event, p_actor, v_actor, 'GIFT_WISHES_IMPORTED', 'EVENT',
    jsonb_build_object('rows', v_total, 'updated', v_count));
  return v_count;
end $$;

revoke all on function santa.update_gift_wishes(uuid, uuid, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function santa.update_gift_wishes(uuid, uuid, jsonb) from anon, authenticated';
  end if;
end $$;
