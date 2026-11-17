# Santa Secreto — Decisiones de arquitectura

Este documento resume las decisiones técnicas importantes y el porqué de cada una.

## 1. Visión general

```
Navegador (celular / PC / TV)
   │  HTML + RSC + Server Actions (cookies HttpOnly)
   ▼
Next.js 16 (App Router) en Vercel  ──►  Supabase Realtime (Broadcast: solo "señales")
   │  pg (pool) — SQL parametrizado + funciones plpgsql
   ▼
PostgreSQL de Supabase (esquema `santa`)     Supabase Storage (bucket privado `participant-photos`)
```

* **Todo acceso a datos ocurre en el servidor.** El navegador nunca habla con la base de datos ni con
  Storage. No existe ninguna clave secreta en el cliente.
* El navegador solo recibe la clave *publishable* de Supabase para **escuchar** señales de Realtime.
  Esas señales no contienen datos: solo dicen "algo cambió, vuelve a consultar al servidor".

## 2. Capas del código

| Carpeta | Responsabilidad |
| --- | --- |
| `src/domain/` | Reglas puras sin dependencias: derangement, normalización de nombres, máquina de estados, permisos de fotos, etiquetas de tarjetas. 100 % testeables. |
| `src/lib/validation/` | Esquemas Zod de todas las entradas. |
| `src/server/db/` | Adaptador de base de datos (`pg` en producción, PGlite en local/pruebas) y ejecutor de migraciones. |
| `src/server/services/` | Servicios de aplicación (casos de uso). Reciben `db` y un `actor`; no conocen React ni cookies. |
| `src/server/auth/` | Sesiones (cookies), guardas de autorización para páginas y acciones. |
| `src/server/storage/`, `src/server/images.ts` | Fotografías: almacenamiento privado y procesamiento con `sharp`. |
| `src/server/realtime.ts` | Envío de señales Broadcast (sin secretos). |
| `src/app/` | Páginas, layouts, Server Actions (`actions.ts`) y Route Handlers (`api/`). |
| `src/components/` | Componentes visuales reutilizables. |
| `supabase/migrations/` | Migraciones SQL versionadas. |
| `tests/` | Pruebas unitarias e integración (PostgreSQL real vía PGlite). |

## 3. Base de datos

Esquema propio `santa` (no `public`): la API REST automática de Supabase (PostgREST) **no** lo expone.
Además: RLS activado en todas las tablas sin políticas y permisos revocados a `anon`/`authenticated`.

Tablas: `events`, `participants`, `assignments`, `draw_cards`, `delivery_turns`, `audit_logs`,
`sessions`, `presentation_codes`, `rate_limits`, `schema_migrations`.

Integridad garantizada **por la base de datos** (no solo por el código):

* `assignments`: PK `(event_id, giver_id)` → un destinatario por participante; `UNIQUE (event_id, receiver_id)` →
  cada persona recibe una sola vez; `CHECK (giver_id <> receiver_id)` → nadie se asigna a sí mismo;
  FKs compuestas `(participante, evento)` → imposible mezclar eventos.
* `draw_cards`: PK `(event_id, card_number)`; `UNIQUE (event_id, claimed_by)` → una tarjeta por persona.
* `delivery_turns`: índice único parcial "un solo turno ACTIVO por evento" y "un solo turno COMPLETADO por receptor".
* `participants`: únicos `(event_id, identifier)` y `(event_id, name_normalized)`.
* Trigger `participants_guard`: después de iniciar el sorteo no se pueden agregar/eliminar participantes ni
  cambiar identificadores o estado activo. En eventos archivados no se cambia nada histórico.
* Trigger de "último organizador": no se puede eliminar/desactivar/degradar al último organizador activo.

### Operaciones críticas = funciones plpgsql transaccionales

Cada función bloquea la fila del evento (`SELECT … FOR UPDATE`), valida permisos y estado, escribe y
registra auditoría en **una sola transacción**:

`start_draw`, `claim_card`, `reset_draw`, `set_draw_locked`, `start_delivery`, `start_turn`, `cancel_turn`,
`confirm_delivery`, `revert_delivery`, `finish_event`, `archive_event`, `emergency_assignments`,
`expected_giver`, `import_participants`, `create_event`, `activate_event`, `purge_event`.

## 4. Sorteo (derangement)

1. El servidor obtiene los UUID de los participantes activos.
2. Genera una permutación aleatoria uniforme con Fisher–Yates usando `crypto.randomInt` (CSPRNG de Node)
   y la acepta solo si no tiene puntos fijos (nadie se tiene a sí mismo). Si no, repite (≈2,7 intentos en promedio).
   Esto produce un derangement **uniforme** entre todos los posibles (no solo ciclos únicos).
3. Valida el resultado en TypeScript (biyección completa, sin autoasignación).
4. `santa.start_draw` vuelve a validar todo en SQL (mismo conjunto de participantes, sin duplicados, sin
   autoasignación), inserta asignaciones y tarjetas y cambia el estado — todo o nada.

### Tarjetas y concurrencia

`santa.claim_card(evento, participante, tarjeta)`:

* Bloquea el evento `FOR UPDATE` → las reclamaciones de un evento se serializan (con ~50 personas son
  milisegundos) y la detección "ya revelaron todos → READY_FOR_DELIVERY" es exacta.
* Si el participante ya tiene tarjeta, devuelve **la misma** (idempotente: doble clic / reintentos no cambian nada).
* `UPDATE draw_cards … WHERE claimed_by IS NULL` — si no actualiza filas, responde `CARD_TAKEN` (respuesta controlada).
* La tarjeta **no** decide el destinatario: la asignación ya existía.

## 5. Identificación y sesiones

* Nombre completo (selector con búsqueda) + número identificador. Sin contraseñas (decisión del propietario).
* **Advertencia:** quien conozca el nombre y el número de otra persona puede suplantarla. No es autenticación fuerte.
* Sesión = token aleatorio de 256 bits en cookie `HttpOnly`, `SameSite=Lax`, `Secure` y prefijo `__Host-` en
  producción. En la BD solo se guarda el **hash SHA-256** del token. Expira a los 14 días; cerrar sesión la borra.
* En cada petición el servidor vuelve a leer el participante: el rol **siempre** viene de la BD.
* Límite de intentos fallidos (por IP y por nombre) persistido en PostgreSQL (`rate_limits`), válido en serverless.
* CSRF: Server Actions comparan `Origin` vs `Host` (Next.js); los Route Handlers que mutan validan `Origin`;
  cookies `SameSite=Lax`.

### Pantalla de TV

El organizador genera un **código de 6 caracteres** (válido 15 min, un solo uso). En el televisor se abre
`/tv`, se escribe el código y el TV recibe una sesión de tipo `PRESENTATION` (12 h) de solo lectura.
El endpoint del TV devuelve únicamente el estado público: nunca el regalador de un turno no confirmado.

## 6. Tiempo real

Supabase Realtime **Broadcast** en el canal `santa-<eventId>`. El servidor envía por HTTP (`httpSend`) señales
como `{ "kind": "cards" }`. Los clientes, al recibirlas, vuelven a pedir datos al servidor (que aplica la autorización).
Si Realtime no está configurado o falla, todos los clientes hacen *polling* periódico. La consistencia
nunca depende de Realtime: la garantiza PostgreSQL.

## 7. Fotografías

* Bucket privado; ruta interna `eventId/participantId/uuid.webp`.
* Validación por "magic bytes" (JPG/PNG/WebP reales) y tamaño; `sharp` corrige orientación, redimensiona
  (máx. 900 px), convierte a WebP y **elimina EXIF/GPS**.
* Se entregan por `/api/fotos/:id` solo si el visitante está autorizado (`src/domain/photo-access.ts`).

## 8. Máquina de estados del evento

```
DRAFT ──start_draw──► DRAW_OPEN ──(todos revelaron, automático)──► READY_FOR_DELIVERY
  ▲                      │  ▲                                          │
  └──────reset_draw──────┴──┴──────────────reset_draw──────────────────┘
READY_FOR_DELIVERY ──start_delivery──► DELIVERY_ACTIVE ──finish_event──► COMPLETED ──archive──► ARCHIVED
                                           ▲                                 │
                                           └──────revert_delivery────────────┘
```

`draw_locked` (pausa) es una bandera sobre `DRAW_OPEN`, no un estado: no borra resultados.

## 9. Modo local sin credenciales

Si `DATABASE_URL=pglite:./.data/db`, la app usa PGlite (PostgreSQL embebido) y guarda fotos en `.data/`.
Sirve para probar todo en el computador sin crear nada en Supabase. **No es para producción.**

## 10. Por qué se desactivó `cacheComponents`

Todas las pantallas dependen de la sesión, del estado en tiempo real y de datos secretos. Para evitar
cualquier riesgo de que datos de un usuario queden en una caché compartida, todas las rutas se renderizan
dinámicamente por petición.

## 11. Sugerencias de regalo (migración 0004)

* Columna `santa.participants.gift_wishes TEXT NULL` (máx. 4000 caracteres). Texto libre, se guarda tal cual
  (solo se unifican saltos de línea `\r\n → \n` y se quitan espacios al inicio/fin). `NULL` = sin sugerencias.
* Pertenece al participante **dentro de su evento**. `create_event` (copiar participantes) **no** copia sugerencias.
* Editable solo por organizadores (formulario de participante o importación), en cualquier estado salvo `ARCHIVED`.
  No toca asignaciones, tarjetas, revelaciones ni el estado del evento.
* Importación: `/admin/participantes/sugerencias`. Análisis puro en `src/server/import/gift-wishes.ts`
  (prioriza identificador + verificación de nombre; sin identificador, solo nombre normalizado exacto; nunca
  coincidencias aproximadas; celdas vacías = sin cambios). La escritura es `santa.update_gift_wishes`
  (una transacción, solo la columna `gift_wishes`, solo participantes del evento, idempotente, auditada).
* No se copian en la asignación: la tarjeta siempre muestra las sugerencias **actuales** del destinatario.

## 12. Resultado oculto por defecto

* `claimCardAction` registra la participación y devuelve solo `{status, cardNumber}` — **sin destinatario**.
* `/inicio` renderiza solo el número de tarjeta (`getMyCard`). El HTML inicial no contiene nombre, foto ni sugerencias.
* Al pulsar **👁️ Mostrar**, `revealMySecretFriendAction` (Server Action autenticada, participante tomado de la
  cookie) llama a `getMySecretFriend`, que solo devuelve la asignación propia. Es de solo lectura.
* Al **ocultar**, los datos se descartan del estado de React (no quedan en el DOM). El estado visible no se
  persiste: recargar, volver a ingresar, navegar o restaurar desde la caché "atrás" (`pagehide`/`pageshow`)
  vuelve a mostrar la tarjeta cubierta.
