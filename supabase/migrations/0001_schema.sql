-- Santa Secreto — esquema principal
-- Todas las tablas viven en el esquema `santa`, que NO está expuesto por la API REST de Supabase.

create schema if not exists santa;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type santa.event_status as enum (
  'DRAFT', 'DRAW_OPEN', 'READY_FOR_DELIVERY', 'DELIVERY_ACTIVE', 'COMPLETED', 'ARCHIVED'
);
create type santa.participant_role as enum ('PARTICIPANT', 'ORGANIZER');
create type santa.turn_status as enum ('ACTIVE', 'COMPLETED', 'CANCELLED', 'REVERTED');
create type santa.turn_mode as enum ('RANDOM', 'MANUAL');
create type santa.session_kind as enum ('PARTICIPANT', 'PRESENTATION');

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create function santa.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Lanza un error de negocio con un código que la aplicación traduce a un mensaje amigable.
create function santa.fail(p_code text) returns void
language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = 'SANTA:' || p_code;
end $$;

-- ---------------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------------
create table santa.events (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(btrim(name)) between 1 and 120),
  year                int  not null check (year between 2000 and 2200),
  description         text check (description is null or char_length(description) <= 1000),
  status              santa.event_status not null default 'DRAFT',
  is_current          boolean not null default false,
  draw_locked         boolean not null default false,
  draw_round          int not null default 0 check (draw_round >= 0),
  delivery_date       date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  draw_started_at     timestamptz,
  delivery_started_at timestamptz,
  completed_at        timestamptz,
  archived_at         timestamptz,
  constraint events_lock_only_when_open check (not draw_locked or status = 'DRAW_OPEN')
);

-- Solo puede haber un evento "actual" (el que usa la pantalla de ingreso).
create unique index events_single_current on santa.events ((true)) where is_current;

create trigger events_touch before update on santa.events
  for each row execute function santa.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Participantes (los organizadores también son participantes)
-- ---------------------------------------------------------------------------
create table santa.participants (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references santa.events (id) on delete cascade,
  full_name       text not null check (char_length(btrim(full_name)) between 2 and 120),
  name_normalized text not null check (char_length(name_normalized) between 2 and 120),
  identifier      text not null check (identifier ~ '^[0-9]{1,6}$'),
  photo_path      text,
  photo_version   int  not null default 0,
  role            santa.participant_role not null default 'PARTICIPANT',
  is_active       boolean not null default true,
  revealed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint participants_identifier_unique unique (event_id, identifier),
  constraint participants_name_unique unique (event_id, name_normalized),
  -- Permite FKs compuestas (participante, evento) que impiden mezclar eventos.
  constraint participants_id_event_unique unique (id, event_id)
);

create index participants_event_role_idx on santa.participants (event_id, role) where is_active;

create trigger participants_touch before update on santa.participants
  for each row execute function santa.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Asignaciones secretas (quién le regala a quién)
-- ---------------------------------------------------------------------------
create table santa.assignments (
  event_id    uuid not null references santa.events (id) on delete cascade,
  giver_id    uuid not null,
  receiver_id uuid not null,
  created_at  timestamptz not null default now(),
  -- Un único destinatario por participante.
  constraint assignments_pkey primary key (event_id, giver_id),
  -- Cada persona es asignada exactamente una vez.
  constraint assignments_receiver_unique unique (event_id, receiver_id),
  -- Nadie se asigna a sí mismo.
  constraint assignments_no_self check (giver_id <> receiver_id),
  constraint assignments_giver_fk foreign key (giver_id, event_id)
    references santa.participants (id, event_id),
  constraint assignments_receiver_fk foreign key (receiver_id, event_id)
    references santa.participants (id, event_id)
);

-- ---------------------------------------------------------------------------
-- Tarjetas de revelación (el número NO decide el destinatario)
-- ---------------------------------------------------------------------------
create table santa.draw_cards (
  event_id    uuid not null references santa.events (id) on delete cascade,
  card_number int  not null check (card_number between 1 and 9999),
  claimed_by  uuid,
  claimed_at  timestamptz,
  constraint draw_cards_pkey primary key (event_id, card_number),
  -- Una persona solo puede tener una tarjeta por evento.
  constraint draw_cards_one_per_participant unique (event_id, claimed_by),
  constraint draw_cards_claimed_fk foreign key (claimed_by, event_id)
    references santa.participants (id, event_id),
  constraint draw_cards_claim_consistent check ((claimed_by is null) = (claimed_at is null))
);

-- ---------------------------------------------------------------------------
-- Turnos del día de entrega
-- ---------------------------------------------------------------------------
create table santa.delivery_turns (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references santa.events (id) on delete cascade,
  receiver_id  uuid not null,
  giver_id     uuid,
  mode         santa.turn_mode not null,
  status       santa.turn_status not null default 'ACTIVE',
  started_by   uuid,
  started_at   timestamptz not null default now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  closed_at    timestamptz,
  note         text check (note is null or char_length(note) <= 500),
  constraint delivery_turns_receiver_fk foreign key (receiver_id, event_id)
    references santa.participants (id, event_id),
  constraint delivery_turns_giver_fk foreign key (giver_id, event_id)
    references santa.participants (id, event_id),
  constraint delivery_turns_no_self check (giver_id is null or giver_id <> receiver_id),
  constraint delivery_turns_completed_complete check (
    status <> 'COMPLETED' or (giver_id is not null and confirmed_by is not null and confirmed_at is not null)
  )
);

-- Nunca dos turnos activos a la vez en un evento.
create unique index delivery_turns_one_active on santa.delivery_turns (event_id) where status = 'ACTIVE';
-- Nadie recibe dos entregas completadas.
create unique index delivery_turns_one_completed_per_receiver
  on santa.delivery_turns (event_id, receiver_id) where status = 'COMPLETED';
create index delivery_turns_event_idx on santa.delivery_turns (event_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Auditoría (sobrevive al borrado de participantes; event_id pasa a NULL si se purga el evento)
-- ---------------------------------------------------------------------------
create table santa.audit_logs (
  id          bigint generated always as identity primary key,
  event_id    uuid references santa.events (id) on delete set null,
  actor_id    uuid,
  actor_name  text,
  action      text not null,
  scope       text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_event_idx on santa.audit_logs (event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Sesiones (solo se guarda el hash SHA-256 del token)
-- ---------------------------------------------------------------------------
create table santa.sessions (
  id             uuid primary key default gen_random_uuid(),
  token_hash     text not null unique,
  kind           santa.session_kind not null,
  event_id       uuid not null references santa.events (id) on delete cascade,
  participant_id uuid references santa.participants (id) on delete cascade,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  constraint sessions_kind_consistent check ((kind = 'PARTICIPANT') = (participant_id is not null))
);

create index sessions_expires_idx on santa.sessions (expires_at);

-- Códigos cortos para vincular un televisor (un solo uso, expiran pronto).
create table santa.presentation_codes (
  code_hash  text primary key,
  event_id   uuid not null references santa.events (id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Límite de intentos (persistente: funciona en serverless)
-- ---------------------------------------------------------------------------
create table santa.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         int not null default 0
);
