-- Santa Secreto — reglas de integridad y operaciones transaccionales
-- Cada operación crítica es una función: se ejecuta en UNA transacción, bloquea el evento,
-- valida permisos y estado, escribe y deja auditoría. Todo o nada.

-- ---------------------------------------------------------------------------
-- Triggers de integridad sobre participantes
-- ---------------------------------------------------------------------------

-- Después de iniciar el sorteo no se puede alterar la lista de participantes.
create function santa.participants_guard() returns trigger
language plpgsql as $$
declare
  v_status santa.event_status;
begin
  if current_setting('santa.purging', true) = 'on' then
    return coalesce(new, old);
  end if;

  select status into v_status from santa.events where id = coalesce(new.event_id, old.event_id);
  if v_status is null then
    -- El evento se está eliminando en cascada.
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if v_status <> 'DRAFT' then perform santa.fail('PARTICIPANTS_LOCKED'); end if;
    return new;
  elsif tg_op = 'DELETE' then
    if v_status <> 'DRAFT' then perform santa.fail('PARTICIPANTS_LOCKED'); end if;
    return old;
  end if;

  -- UPDATE
  if new.event_id <> old.event_id then
    perform santa.fail('INVALID_OPERATION');
  end if;
  if v_status = 'ARCHIVED' and (new.full_name, new.name_normalized, new.role, new.identifier, new.is_active)
       is distinct from (old.full_name, old.name_normalized, old.role, old.identifier, old.is_active) then
    perform santa.fail('EVENT_ARCHIVED');
  end if;
  if v_status <> 'DRAFT' and (new.identifier is distinct from old.identifier
                              or new.is_active is distinct from old.is_active) then
    perform santa.fail('PARTICIPANTS_LOCKED');
  end if;
  return new;
end $$;

create trigger participants_guard_trg
  before insert or update or delete on santa.participants
  for each row execute function santa.participants_guard();

-- Siempre debe quedar al menos un organizador activo en el evento.
create function santa.participants_keep_organizer() returns trigger
language plpgsql as $$
begin
  if current_setting('santa.purging', true) = 'on' then
    return null;
  end if;
  if not (old.role = 'ORGANIZER' and old.is_active) then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.role = 'ORGANIZER' and new.is_active then
    return null;
  end if;
  if exists (select 1 from santa.events where id = old.event_id)
     and not exists (select 1 from santa.participants
                     where event_id = old.event_id and role = 'ORGANIZER' and is_active) then
    perform santa.fail('LAST_ORGANIZER');
  end if;
  return null;
end $$;

create trigger participants_keep_organizer_trg
  after update or delete on santa.participants
  for each row execute function santa.participants_keep_organizer();

-- ---------------------------------------------------------------------------
-- Ayudantes
-- ---------------------------------------------------------------------------

-- Verifica que el actor sea un ORGANIZADOR activo del evento. Devuelve su nombre.
create function santa.assert_organizer(p_event uuid, p_actor uuid) returns text
language plpgsql as $$
declare
  v_name text;
begin
  select full_name into v_name from santa.participants
   where id = p_actor and event_id = p_event and role = 'ORGANIZER' and is_active;
  if not found then
    perform santa.fail('FORBIDDEN');
  end if;
  return v_name;
end $$;

create function santa.lock_event(p_event uuid) returns santa.events
language plpgsql as $$
declare
  v_event santa.events;
begin
  select * into v_event from santa.events where id = p_event for update;
  if not found then
    perform santa.fail('EVENT_NOT_FOUND');
  end if;
  return v_event;
end $$;

create function santa.log(
  p_event uuid, p_actor uuid, p_actor_name text, p_action text, p_scope text, p_details jsonb
) returns void
language sql as $$
  insert into santa.audit_logs (event_id, actor_id, actor_name, action, scope, details)
  values (p_event, p_actor, p_actor_name, p_action, p_scope, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- Límite de intentos
-- ---------------------------------------------------------------------------
create function santa.rate_limit_exceeded(p_key text, p_limit int, p_window_seconds int) returns boolean
language sql stable as $$
  select coalesce((
    select hits >= p_limit from santa.rate_limits
     where key = p_key and window_start > now() - make_interval(secs => p_window_seconds)
  ), false);
$$;

create function santa.rate_limit_hit(p_key text, p_window_seconds int) returns int
language plpgsql as $$
declare
  v_hits int;
begin
  insert into santa.rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  delete from santa.rate_limits where window_start < now() - interval '1 day';
  return v_hits;
end $$;

-- ---------------------------------------------------------------------------
-- Sorteo
-- ---------------------------------------------------------------------------

-- Guarda un sorteo generado por la aplicación (CSPRNG) tras revalidarlo por completo.
-- p_givers[i] le regala a p_receivers[i].
create function santa.start_draw(p_event uuid, p_actor uuid, p_givers uuid[], p_receivers uuid[])
returns int
language plpgsql as $$
declare
  v_event santa.events;
  v_actor text;
  v_n     int;
begin
  v_event := santa.lock_event(p_event);
  v_actor := santa.assert_organizer(p_event, p_actor);

  if v_event.status <> 'DRAFT' then
    perform santa.fail('DRAW_ALREADY_STARTED');
  end if;

  select count(*)::int into v_n from santa.participants where event_id = p_event and is_active;
  if v_n < 2 then
    perform santa.fail('NOT_ENOUGH_PARTICIPANTS');
  end if;

  -- El sorteo debe cubrir exactamente a los participantes activos, sin repetidos ni autoasignaciones.
  if coalesce(array_length(p_givers, 1), 0) <> v_n or coalesce(array_length(p_receivers, 1), 0) <> v_n then
    perform santa.fail('INVALID_DRAW');
  end if;
  if (select count(distinct g) from unnest(p_givers) g) <> v_n
     or (select count(distinct r) from unnest(p_receivers) r) <> v_n then
    perform santa.fail('INVALID_DRAW');
  end if;
  if exists (select g from unnest(p_givers) g
             except select id from santa.participants where event_id = p_event and is_active)
     or exists (select r from unnest(p_receivers) r
             except select id from santa.participants where event_id = p_event and is_active) then
    perform santa.fail('INVALID_DRAW');
  end if;
  if exists (select 1 from unnest(p_givers, p_receivers) as t(g, r) where g is null or r is null or g = r) then
    perform santa.fail('INVALID_DRAW');
  end if;

  delete from santa.draw_cards where event_id = p_event;
  delete from santa.assignments where event_id = p_event;

  insert into santa.assignments (event_id, giver_id, receiver_id)
  select p_event, g, r from unnest(p_givers, p_receivers) as t(g, r);

  insert into santa.draw_cards (event_id, card_number)
  select p_event, n from generate_series(1, v_n) as n;

  update santa.participants set revealed_at = null where event_id = p_event and revealed_at is not null;

  update santa.events
     set status = 'DRAW_OPEN', draw_locked = false, draw_started_at = now(), draw_round = draw_round + 1
   where id = p_event;

  perform santa.log(p_event, p_actor, v_actor, 'DRAW_STARTED', 'EVENT',
    jsonb_build_object('participants', v_n, 'round', v_event.draw_round + 1));
  return v_n;
end $$;

-- Reclama una tarjeta y revela la asignación del participante. Idempotente.
-- Resultados: OK | ALREADY_REVEALED | CARD_TAKEN | CARD_NOT_FOUND | DRAW_NOT_STARTED |
--             DRAW_CLOSED | DRAW_LOCKED | NOT_IN_DRAW
create function santa.claim_card(p_event uuid, p_participant uuid, p_card int)
returns table (result text, card_number int, receiver_id uuid)
language plpgsql as $$
#variable_conflict use_column
declare
  v_event    santa.events;
  v_card     int;
  v_receiver uuid;
begin
  v_event := santa.lock_event(p_event);

  if not exists (select 1 from santa.participants
                  where id = p_participant and event_id = p_event and is_active) then
    return query select 'NOT_IN_DRAW'::text, null::int, null::uuid;
    return;
  end if;

  -- Reintentos / doble clic: devolver exactamente lo que ya se reveló.
  select c.card_number into v_card from santa.draw_cards c
   where c.event_id = p_event and c.claimed_by = p_participant;
  if found then
    select a.receiver_id into v_receiver from santa.assignments a
     where a.event_id = p_event and a.giver_id = p_participant;
    return query select 'ALREADY_REVEALED'::text, v_card, v_receiver;
    return;
  end if;

  if v_event.status = 'DRAFT' then
    return query select 'DRAW_NOT_STARTED'::text, null::int, null::uuid;
    return;
  elsif v_event.status <> 'DRAW_OPEN' then
    return query select 'DRAW_CLOSED'::text, null::int, null::uuid;
    return;
  elsif v_event.draw_locked then
    return query select 'DRAW_LOCKED'::text, null::int, null::uuid;
    return;
  end if;

  select a.receiver_id into v_receiver from santa.assignments a
   where a.event_id = p_event and a.giver_id = p_participant;
  if v_receiver is null then
    return query select 'NOT_IN_DRAW'::text, null::int, null::uuid;
    return;
  end if;

  update santa.draw_cards c
     set claimed_by = p_participant, claimed_at = now()
   where c.event_id = p_event and c.card_number = p_card and c.claimed_by is null
  returning c.card_number into v_card;

  if v_card is null then
    if exists (select 1 from santa.draw_cards c where c.event_id = p_event and c.card_number = p_card) then
      return query select 'CARD_TAKEN'::text, null::int, null::uuid;
    else
      return query select 'CARD_NOT_FOUND'::text, null::int, null::uuid;
    end if;
    return;
  end if;

  update santa.participants set revealed_at = now() where id = p_participant;

  -- Cuando TODOS los participantes activos revelaron, el evento queda listo para la entrega.
  if not exists (select 1 from santa.participants
                  where event_id = p_event and is_active and revealed_at is null) then
    update santa.events set status = 'READY_FOR_DELIVERY' where id = p_event;
    perform santa.log(p_event, null, 'Sistema', 'DRAW_COMPLETED', 'EVENT', '{}'::jsonb);
  end if;

  return query select 'OK'::text, v_card, v_receiver;
end $$;

-- Reinicio explícito: invalida asignaciones, tarjetas y revelaciones. NO genera un sorteo nuevo.
create function santa.reset_draw(p_event uuid, p_actor uuid, p_reason text) returns void
language plpgsql as $$
declare
  v_event    santa.events;
  v_actor    text;
  v_revealed int;
begin
  v_event := santa.lock_event(p_event);
  v_actor := santa.assert_organizer(p_event, p_actor);

  if v_event.status not in ('DRAW_OPEN', 'READY_FOR_DELIVERY') then
    perform santa.fail('INVALID_STATE');
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    perform santa.fail('REASON_REQUIRED');
  end if;

  select count(*)::int into v_revealed from santa.participants
   where event_id = p_event and revealed_at is not null;

  delete from santa.delivery_turns where event_id = p_event;
  delete from santa.draw_cards where event_id = p_event;
  delete from santa.assignments where event_id = p_event;
  update santa.participants set revealed_at = null where event_id = p_event and revealed_at is not null;
  update santa.events
     set status = 'DRAFT', draw_locked = false, draw_started_at = null
   where id = p_event;

  perform santa.log(p_event, p_actor, v_actor, 'DRAW_RESET', 'EVENT',
    jsonb_build_object('reason', btrim(p_reason), 'previous_status', v_event.status,
                       'revealed_before_reset', v_revealed, 'round', v_event.draw_round));
end $$;

create function santa.set_draw_locked(p_event uuid, p_actor uuid, p_locked boolean) returns void
language plpgsql as $$
declare
  v_event santa.events;
  v_actor text;
begin
  v_event := santa.lock_event(p_event);
  v_actor := santa.assert_organizer(p_event, p_actor);
  if v_event.status <> 'DRAW_OPEN' then
    perform santa.fail('INVALID_STATE');
  end if;
  update santa.events set draw_locked = p_locked where id = p_event;
  perform santa.log(p_event, p_actor, v_actor, case when p_locked then 'DRAW_LOCKED' else 'DRAW_UNLOCKED' end,
    'EVENT', '{}'::jsonb);
end $$;

-- Consulta de emergencia: devuelve asignaciones y deja auditoría en la misma transacción.
create function santa.emergency_assignments(p_event uuid, p_actor uuid, p_giver uuid, p_reason text)
returns table (
  giver_id uuid, giver_name text, giver_identifier text,
  receiver_id uuid, receiver_name text, receiver_identifier text, revealed boolean
)
language plpgsql as $$
declare
  v_actor text;
begin
  v_actor := santa.assert_organizer(p_event, p_actor);
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    perform santa.fail('REASON_REQUIRED');
  end if;

  perform santa.log(p_event, p_actor, v_actor, 'EMERGENCY_VIEW',
    case when p_giver is null then 'ALL_ASSIGNMENTS' else 'PARTICIPANT:' || p_giver::text end,
    jsonb_build_object('reason', btrim(p_reason)));

  return query
    select g.id, g.full_name, g.identifier, r.id, r.full_name, r.identifier, g.revealed_at is not null
      from santa.assignments a
      join santa.participants g on g.id = a.giver_id
      join santa.participants r on r.id = a.receiver_id
     where a.event_id = p_event and (p_giver is null or a.giver_id = p_giver)
     order by g.full_name;
end $$;

-- ---------------------------------------------------------------------------
-- Día de entrega
-- ---------------------------------------------------------------------------
create function santa.start_delivery(p_event uuid, p_actor uuid) returns void
language plpgsql as $$
declare
  v_event santa.events;
  v_actor text;
begin
  v_event := santa.lock_event(p_event);
  v_actor := santa.assert_organizer(p_event, p_actor);
  if v_event.status <> 'READY_FOR_DELIVERY' then
    perform santa.fail('INVALID_STATE');
  end if;
  update santa.events set status = 'DELIVERY_ACTIVE', delivery_started_at = now() where id = p_event;
  perform santa.log(p_event, p_actor, v_actor, 'DELIVERY_STARTED', 'EVENT', '{}'::jsonb);
end $$;

create function santa.start_turn(p_event uuid, p_actor uuid, p_receiver uuid, p_mode santa.turn_mode)
returns uuid
language plpgsql as $$
declare
  v_event santa.events;
  v_actor text;
  v_id    uuid;
begin
  v_event := santa.lock_event(p_event);
  v_actor := santa.assert_organizer(p_event, p_actor);
  if v_event.status <> 'DELIVERY_ACTIVE' then
    perform santa.fail('INVALID_STATE');
  end if;
  if exists (select 1 from santa.delivery_turns where event_id = p_event and status = 'ACTIVE') then
    perform santa.fail('TURN_ALREADY_ACTIVE');
  end if;
  if not exists (select 1 from santa.assignments a
                   join santa.participants p on p.id = a.receiver_id
                  where a.event_id = p_event and a.receiver_id = p_receiver and p.is_active) then
    perform santa.fail('NOT_IN_DRAW');
  end if;
  if exists (select 1 from santa.delivery_turns
              where event_id = p_event and receiver_id = p_receiver and status = 'COMPLETED') then
    perform santa.fail('ALREADY_RECEIVED');
  end if;

  insert into santa.delivery_turns (event_id, receiver_id, mode, status, started_by)
  values (p_event, p_receiver, p_mode, 'ACTIVE', p_actor)
  returning id into v_id;

  perform santa.log(p_event, p_actor, v_actor, 'TURN_STARTED', 'TURN',
    jsonb_build_object('turn_id', v_id, 'receiver_id', p_receiver, 'mode', p_mode));
  return v_id;
end $$;

create function santa.cancel_turn(p_event uuid, p_actor uuid, p_turn uuid) returns void
language plpgsql as $$
declare
  v_actor text;
begin
  perform santa.lock_event(p_event);
  v_actor := santa.assert_organizer(p_event, p_actor);
  update santa.delivery_turns set status = 'CANCELLED', closed_at = now()
   where id = p_turn and event_id = p_event and status = 'ACTIVE';
  if not found then
    perform santa.fail('TURN_NOT_ACTIVE');
  end if;
  perform santa.log(p_event, p_actor, v_actor, 'TURN_CANCELLED', 'TURN', jsonb_build_object('turn_id', p_turn));
end $$;

-- Devuelve el regalador esperado del turno ACTIVO (solo para validar la entrega) y lo audita.
create function santa.expected_giver(p_event uuid, p_actor uuid, p_turn uuid)
returns table (giver_id uuid, giver_name text, giver_identifier text)
language plpgsql as $$
declare
  v_actor text;
begin
  v_actor := santa.assert_organizer(p_event, p_actor);
  if not exists (select 1 from santa.delivery_turns
                  where id = p_turn and event_id = p_event and status = 'ACTIVE') then
    perform santa.fail('TURN_NOT_ACTIVE');
  end if;
  perform santa.log(p_event, p_actor, v_actor, 'EXPECTED_GIVER_VIEWED', 'TURN', jsonb_build_object('turn_id', p_turn));
  return query
    select g.id, g.full_name, g.identifier
      from santa.delivery_turns t
      join santa.assignments a on a.event_id = t.event_id and a.receiver_id = t.receiver_id
      join santa.participants g on g.id = a.giver_id
     where t.id = p_turn;
end $$;

-- Confirma la entrega del turno activo. Idempotente ante dobles confirmaciones.
-- Resultados: OK | ALREADY_CONFIRMED
create function santa.confirm_delivery(p_event uuid, p_actor uuid, p_turn uuid)
returns table (result text, receiver_id uuid, giver_id uuid)
language plpgsql as $$
#variable_conflict use_column
declare
  v_event santa.events;
  v_actor text;
  v_turn  santa.delivery_turns;
  v_giver uuid;
begin
  v_event := santa.lock_event(p_event);
  v_actor := santa.assert_organizer(p_event, p_actor);

  select * into v_turn from santa.delivery_turns t where t.id = p_turn and t.event_id = p_event for update;
  if not found then
    perform santa.fail('TURN_NOT_FOUND');
  end if;
  if v_turn.status = 'COMPLETED' then
    return query select 'ALREADY_CONFIRMED'::text, v_turn.receiver_id, v_turn.giver_id;
    return;
  end if;
  if v_turn.status <> 'ACTIVE' then
    perform santa.fail('TURN_NOT_ACTIVE');
  end if;
  if v_event.status <> 'DELIVERY_ACTIVE' then
    perform santa.fail('INVALID_STATE');
  end if;

  select a.giver_id into v_giver from santa.assignments a
   where a.event_id = p_event and a.receiver_id = v_turn.receiver_id;
  if v_giver is null then
    perform santa.fail('NOT_IN_DRAW');
  end if;

  update santa.delivery_turns t
     set status = 'COMPLETED', giver_id = v_giver, confirmed_by = p_actor,
         confirmed_at = now(), closed_at = now()
   where t.id = p_turn;

  perform santa.log(p_event, p_actor, v_actor, 'DELIVERY_CONFIRMED', 'TURN',
    jsonb_build_object('turn_id', p_turn, 'receiver_id', v_turn.receiver_id));
  return query select 'OK'::text, v_turn.receiver_id, v_giver;
end $$;

-- Corrige una confirmación equivocada (acción administrativa auditada).
create function santa.revert_delivery(p_event uuid, p_actor uuid, p_turn uuid, p_reason text) returns void
language plpgsql as $$
declare
  v_event santa.events;
  v_actor text;
begin
  v_event := santa.lock_event(p_event);
  v_actor := santa.assert_organizer(p_event, p_actor);
  if v_event.status not in ('DELIVERY_ACTIVE', 'COMPLETED') then
    perform santa.fail('INVALID_STATE');
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    perform santa.fail('REASON_REQUIRED');
  end if;

  update santa.delivery_turns
     set status = 'REVERTED', note = left(btrim(p_reason), 500)
   where id = p_turn and event_id = p_event and status = 'COMPLETED';
  if not found then
    perform santa.fail('TURN_NOT_COMPLETED');
  end if;

  if v_event.status = 'COMPLETED' then
    update santa.events set status = 'DELIVERY_ACTIVE', completed_at = null where id = p_event;
  end if;

  perform santa.log(p_event, p_actor, v_actor, 'DELIVERY_REVERTED', 'TURN',
    jsonb_build_object('turn_id', p_turn, 'reason', btrim(p_reason)));
end $$;

-- Finaliza el evento. Con regalos pendientes solo se permite con p_force y un motivo (excepcional).
create function santa.finish_event(p_event uuid, p_actor uuid, p_force boolean, p_reason text) returns void
language plpgsql as $$
declare
  v_event   santa.events;
  v_actor   text;
  v_pending int;
begin
  v_event := santa.lock_event(p_event);
  v_actor := santa.assert_organizer(p_event, p_actor);
  if v_event.status <> 'DELIVERY_ACTIVE' then
    perform santa.fail('INVALID_STATE');
  end if;
  if exists (select 1 from santa.delivery_turns where event_id = p_event and status = 'ACTIVE') then
    perform santa.fail('TURN_STILL_ACTIVE');
  end if;

  select count(*)::int into v_pending
    from santa.assignments a
   where a.event_id = p_event
     and not exists (select 1 from santa.delivery_turns t
                      where t.event_id = p_event and t.receiver_id = a.receiver_id and t.status = 'COMPLETED');

  if v_pending > 0 then
    if not coalesce(p_force, false) then
      perform santa.fail('GIFTS_PENDING');
    end if;
    if p_reason is null or char_length(btrim(p_reason)) < 3 then
      perform santa.fail('REASON_REQUIRED');
    end if;
  end if;

  update santa.events set status = 'COMPLETED', completed_at = now() where id = p_event;
  perform santa.log(p_event, p_actor, v_actor,
    case when v_pending > 0 then 'EVENT_FORCE_COMPLETED' else 'EVENT_COMPLETED' end, 'EVENT',
    jsonb_build_object('pending', v_pending, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end $$;

create function santa.archive_event(p_event uuid, p_actor uuid) returns void
language plpgsql as $$
declare
  v_event santa.events;
  v_actor text;
begin
  v_event := santa.lock_event(p_event);
  v_actor := santa.assert_organizer(p_event, p_actor);
  if v_event.status <> 'COMPLETED' then
    perform santa.fail('INVALID_STATE');
  end if;
  update santa.events set status = 'ARCHIVED', archived_at = now() where id = p_event;
  perform santa.log(p_event, p_actor, v_actor, 'EVENT_ARCHIVED', 'EVENT', '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Participantes y eventos
-- ---------------------------------------------------------------------------

-- Importación masiva atómica: o entran todas las filas o ninguna.
create function santa.import_participants(p_event uuid, p_actor uuid, p_rows jsonb) returns int
language plpgsql as $$
declare
  v_event santa.events;
  v_actor text;
  v_count int;
begin
  v_event := santa.lock_event(p_event);
  v_actor := santa.assert_organizer(p_event, p_actor);
  if v_event.status <> 'DRAFT' then
    perform santa.fail('PARTICIPANTS_LOCKED');
  end if;

  insert into santa.participants (event_id, full_name, name_normalized, identifier, role)
  select p_event, x.full_name, x.name_normalized, x.identifier, x.role
    from jsonb_to_recordset(p_rows) as x(full_name text, name_normalized text, identifier text,
                                         role santa.participant_role);
  get diagnostics v_count = row_count;

  perform santa.log(p_event, p_actor, v_actor, 'PARTICIPANTS_IMPORTED', 'EVENT',
    jsonb_build_object('count', v_count));
  return v_count;
end $$;

-- Crea un evento nuevo (no actual). Opcionalmente copia los datos básicos de participantes
-- (nunca asignaciones). El creador siempre queda como organizador del nuevo evento.
create function santa.create_event(
  p_actor_event uuid, p_actor uuid, p_name text, p_year int, p_description text,
  p_delivery_date date, p_copy_participants boolean
) returns uuid
language plpgsql as $$
declare
  v_actor text;
  v_id    uuid;
begin
  v_actor := santa.assert_organizer(p_actor_event, p_actor);

  insert into santa.events (name, year, description, delivery_date)
  values (btrim(p_name), p_year, nullif(btrim(coalesce(p_description, '')), ''), p_delivery_date)
  returning id into v_id;

  if p_copy_participants then
    insert into santa.participants (event_id, full_name, name_normalized, identifier, photo_path,
                                    photo_version, role, is_active)
    select v_id, full_name, name_normalized, identifier, photo_path, photo_version, role, is_active
      from santa.participants where event_id = p_actor_event;
    update santa.participants set role = 'ORGANIZER', is_active = true
     where event_id = v_id
       and name_normalized = (select name_normalized from santa.participants where id = p_actor);
  else
    insert into santa.participants (event_id, full_name, name_normalized, identifier, photo_path,
                                    photo_version, role, is_active)
    select v_id, full_name, name_normalized, identifier, photo_path, photo_version, 'ORGANIZER', true
      from santa.participants where id = p_actor;
  end if;

  perform santa.log(p_actor_event, p_actor, v_actor, 'EVENT_CREATED', 'EVENT',
    jsonb_build_object('new_event_id', v_id, 'name', btrim(p_name), 'copied', p_copy_participants));
  perform santa.log(v_id, p_actor, v_actor, 'EVENT_CREATED', 'EVENT',
    jsonb_build_object('from_event_id', p_actor_event, 'copied', p_copy_participants));
  return v_id;
end $$;

-- Cambia el evento actual. Cierra todas las sesiones (todos vuelven a identificarse).
create function santa.activate_event(p_actor_event uuid, p_actor uuid, p_target uuid) returns void
language plpgsql as $$
declare
  v_actor   text;
  v_current santa.events;
  v_target  santa.events;
begin
  v_current := santa.lock_event(p_actor_event);
  v_actor := santa.assert_organizer(p_actor_event, p_actor);
  if not v_current.is_current then
    perform santa.fail('FORBIDDEN');
  end if;
  if v_current.status not in ('DRAFT', 'COMPLETED', 'ARCHIVED') then
    perform santa.fail('EVENT_IN_PROGRESS');
  end if;
  v_target := santa.lock_event(p_target);
  if v_target.id = v_current.id then
    return;
  end if;
  if v_target.status = 'ARCHIVED' then
    perform santa.fail('EVENT_ARCHIVED');
  end if;
  if not exists (select 1 from santa.participants
                  where event_id = p_target and role = 'ORGANIZER' and is_active) then
    perform santa.fail('NO_ORGANIZER');
  end if;

  update santa.events set is_current = false where is_current;
  update santa.events set is_current = true where id = p_target;
  delete from santa.sessions;
  delete from santa.presentation_codes;

  perform santa.log(p_actor_event, p_actor, v_actor, 'EVENT_DEACTIVATED', 'EVENT',
    jsonb_build_object('new_current', p_target));
  perform santa.log(p_target, p_actor, v_actor, 'EVENT_ACTIVATED', 'EVENT',
    jsonb_build_object('previous_current', p_actor_event));
end $$;

-- Elimina datos de un evento ARCHIVADO que no es el actual.
-- p_mode = 'PHOTOS' (solo fotos) | 'ALL' (evento completo).
-- Devuelve las rutas de fotos que ya nadie referencia, para borrarlas de Storage.
create function santa.purge_event(p_actor_event uuid, p_actor uuid, p_target uuid, p_mode text)
returns table (photo_path text)
language plpgsql as $$
#variable_conflict use_column
declare
  v_actor  text;
  v_target santa.events;
  v_paths  text[];
begin
  v_actor := santa.assert_organizer(p_actor_event, p_actor);
  v_target := santa.lock_event(p_target);
  if v_target.status <> 'ARCHIVED' or v_target.is_current then
    perform santa.fail('PURGE_NOT_ALLOWED');
  end if;
  if p_mode not in ('PHOTOS', 'ALL') then
    perform santa.fail('INVALID_OPERATION');
  end if;

  select coalesce(array_agg(distinct p.photo_path), '{}') into v_paths
    from santa.participants p
   where p.event_id = p_target and p.photo_path is not null
     and not exists (select 1 from santa.participants o
                      where o.photo_path = p.photo_path and o.event_id <> p_target);

  perform set_config('santa.purging', 'on', true);
  if p_mode = 'ALL' then
    delete from santa.events where id = p_target;
  else
    update santa.participants set photo_path = null, photo_version = photo_version + 1
     where event_id = p_target and photo_path is not null;
  end if;
  perform set_config('santa.purging', 'off', true);

  perform santa.log(p_actor_event, p_actor, v_actor,
    case when p_mode = 'ALL' then 'EVENT_PURGED' else 'EVENT_PHOTOS_PURGED' end, 'EVENT',
    jsonb_build_object('target_event_id', p_target, 'target_name', v_target.name,
                       'photos_deleted', coalesce(array_length(v_paths, 1), 0)));

  return query select unnest(v_paths);
end $$;
