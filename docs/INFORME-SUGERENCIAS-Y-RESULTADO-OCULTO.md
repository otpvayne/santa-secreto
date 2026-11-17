# Informe — Sugerencias de regalo y resultado oculto por defecto

Fecha: 2026-11-10 · Estado: implementado y probado en local. **Nada se ha ejecutado contra Supabase ni Vercel.**

## 1. Archivos

### Nuevos
| Archivo | Propósito |
| --- | --- |
| `supabase/migrations/0004_gift_wishes.sql` | Columna `gift_wishes` + función `santa.update_gift_wishes` |
| `src/domain/gift-wishes.ts` | Limpieza mínima del texto (`\r\n→\n`, trim exterior; vacío → null) |
| `src/server/import/gift-wishes.ts` | Análisis del Excel: detección de columnas, emparejamiento seguro, vista previa |
| `src/app/admin/participantes/sugerencias/page.tsx` | Página "🎁 Importar sugerencias de regalo" |
| `src/app/admin/participantes/sugerencias/gift-wishes-wizard.tsx` | Asistente: columnas, vista previa, comparación, selección, confirmación |
| `tests/unit/gift-wishes.test.ts` | 15 pruebas unitarias |
| `tests/integration/gift-wishes.test.ts` | 13 pruebas de integración (PostgreSQL real vía PGlite) |
| `docs/INFORME-SUGERENCIAS-Y-RESULTADO-OCULTO.md` | Este informe |

### Modificados
| Archivo | Cambio |
| --- | --- |
| `src/server/services/participants.ts` | `giftWishes` en lectura/creación/edición; vista previa y confirmación de importación |
| `src/server/services/draw.ts` | `getMyCard` (sin destinatario) y `getMySecretFriend` (asignación propia + sugerencias actuales) |
| `src/app/sorteo/actions.ts` | `claimCardAction` ya **no** devuelve el destinatario; nueva `revealMySecretFriendAction` |
| `src/components/secret-friend-card.tsx` | Tarjeta cubierta, tarjeta revelada con sugerencias, alternar mostrar/ocultar |
| `src/app/sorteo/cards-board.tsx` | Tras abrir la tarjeta muestra el resultado **oculto** |
| `src/app/inicio/page.tsx` | Solo renderiza el número de tarjeta; el resultado se pide al pulsar "Mostrar" |
| `src/app/admin/participantes/actions.ts` | Acciones de vista previa/confirmación de sugerencias |
| `src/app/admin/participantes/participants-manager.tsx` | Campo "🎁 Opciones de regalo" (textarea) |
| `src/app/admin/participantes/page.tsx` | Botón "🎁 Importar sugerencias de regalo" |
| `src/components/participant-table.tsx` | Indicador 🎁 y filtro "Sin sugerencias de regalo" (solo en administración) |
| `src/lib/validation/schemas.ts` | `giftWishesSchema`, `wishesImportSelectionSchema` |
| `scripts/e2e-server.ts`, `tests/e2e/flujo-completo.spec.ts` | Datos y verificaciones E2E del nuevo flujo |
| `README.md`, `docs/ARQUITECTURA.md` (§11–12), `docs/PROGRESO.md` | Documentación |

No se tocaron: algoritmo de sorteo, `claim_card`, tarjetas numeradas, identificadores, roles, fotos, entrega, TV, migraciones 0001–0003.

## 2. Migración creada: `0004_gift_wishes.sql`

* `alter table santa.participants add column if not exists gift_wishes text;` — NULLABLE, sin valor por defecto:
  PostgreSQL solo cambia el catálogo; **no reescribe filas** ni modifica datos existentes.
* `CHECK (gift_wishes is null or char_length(gift_wishes) <= 4000)` — se valida al instante (todas las filas son NULL).
* `santa.update_gift_wishes(evento, actor, filas)` — bloquea el evento, exige ORGANIZADOR, rechaza ARCHIVED,
  valida que **todas** las filas sean participantes de ese evento (si una falla, no se escribe ninguna),
  solo actualiza `gift_wishes`, omite textos idénticos (idempotente) y registra auditoría `GIFT_WISHES_IMPORTED`.
* Permisos revocados a `public`/`anon`/`authenticated`, igual que las demás funciones.
* Re-ejecutable (`if not exists` / `create or replace`). Verificado por prueba: sobre una base con 0001–0003 y
  un sorteo en curso, aplicar 0004 deja participantes y asignaciones idénticos byte a byte.

## 3. Funcionalidades

**Sugerencias de regalo**
* Campo "🎁 Opciones de regalo" al crear/editar participantes. Vaciarlo y guardar = borrado explícito.
  Editable incluso con el sorteo en curso; no altera asignaciones, tarjetas, progreso ni estado.
* Importación independiente desde Excel/CSV: detecta columnas (o permite elegir la de sugerencias), empareja,
  muestra resumen (encontrados, sin coincidencia, conflictos, con/sin sugerencias, a actualizar), compara
  "Actual / Nuevo", y solo aplica las filas marcadas. Al confirmar, el servidor **vuelve a analizar** el archivo
  y exige que cada fila apunte al mismo participante que se revisó.
  * Prioridad: número identificador **y** comprobación contra el nombre. Si no coinciden → conflicto (no se aplica).
  * Sin identificador: solo nombre normalizado **exacto** (ignora tildes, mayúsculas y espacios). Nunca aproximado.
  * Identificador que Excel guardó como número (7 en vez de 07): se reconoce solo si es inequívoco; sin nombre que lo confirme queda "Revisar" (desmarcado).
  * Celda vacía = sin cambios (nunca borra). Misma persona en varias filas con texto = conflicto.
  * Nunca crea participantes ni toca otros eventos.
* En la tarjeta revelada: foto, nombre y "🎁 ¿Qué le gustaría recibir?" con el texto original (saltos de línea
  respetados, sin listas artificiales) + "✨ Estas son algunas ideas…". Sin sugerencias: mensaje 🎄 alternativo.
  Siempre se leen las sugerencias **actuales** del destinatario (no se copian en la asignación).
* Crear un evento copiando participantes **no** copia sugerencias (separación entre eventos).

**Resultado oculto por defecto**
* Abrir una tarjeta registra la participación igual que antes, pero la respuesta ya no contiene al destinatario.
* Se muestra una tarjeta cubierta (regalo cerrado, "🎄 ¡Tu amigo secreto está listo!") con
  "👁️ MOSTRAR MI AMIGO SECRETO". Al pulsarlo, una solicitud autenticada trae **solo la asignación propia**;
  transición de volteo (solo fundido con "movimiento reducido"). "🙈 OCULTAR MI AMIGO SECRETO" descarta los
  datos de la memoria y del DOM. Se puede alternar sin límite; no reclama tarjetas ni escribe nada.
* Empieza oculto siempre: al recargar, volver a ingresar, navegar y regresar, o volver con "atrás" del navegador.
  Nada se guarda en localStorage ni cookies.
* El HTML inicial de `/inicio` y `/sorteo` no contiene nombre, foto ni sugerencias del destinatario.

## 4. Resultados de las pruebas (ejecutadas)

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ sin errores ni advertencias |
| `npm run typecheck` | ✅ sin errores |
| `npm run test:all` (unitarias + integración + concurrencia) | ✅ **132/132** (antes 99; +28 nuevas; concurrencia sobre PostgreSQL 18 nativo) |
| `npm run build` | ✅ compilación de producción correcta |
| `npm run test:e2e` | ✅ **2/2** (Chromium, Pixel 7, build de producción) |

La E2E verifica, entre otras cosas: resultado oculto tras abrir la tarjeta; la respuesta del reclamo y el HTML
previo **no** contienen el nombre; mostrar/ocultar/mostrar; sugerencias con saltos de línea y caso sin
sugerencias; recarga, navegación, atrás/adelante y cerrar sesión → oculto; un organizador edita las sugerencias
con el sorteo en curso y el participante ve el texto nuevo; no se puede reclamar una segunda tarjeta; la entrega
y el TV siguen funcionando.

Lectura local (sin base de datos) de `santa-secreto-participantes-2026 (1).xlsx`: columnas detectadas
automáticamente — **"Nombre completo"** (nombre) y **"Regalo"** (sugerencias); 44 filas, 35 con sugerencias,
9 vacías, 4 con saltos de línea; **sin columna de número identificador** → el emparejamiento será por nombre exacto.

## 5. Posibles riesgos

1. **Orden de despliegue (el más importante):** el código nuevo lee `gift_wishes`. Si se publica en Vercel
   **antes** de aplicar la migración, la administración y "Mostrar" fallarán. Aplica la migración primero.
   (La migración sola es inofensiva para la versión actual: la columna nueva se ignora.)
2. **Nombres que no coinciden exactamente:** tu Excel no trae identificadores. Si un nombre está escrito distinto
   (p. ej. falta un apellido), aparecerá como "Sin coincidencia" y no se actualizará; complétalo a mano.
3. **Pestañas abiertas durante el despliegue:** quien tenga `/sorteo` abierto con la versión anterior puede ver
   un error al pulsar; al recargar la página funciona. Conviene publicar cuando nadie esté sorteando.
4. Los organizadores ven las sugerencias de todos en el panel (por diseño: son quienes las administran).
5. Privacidad del ingreso sin contraseña (ya existente): quien conozca nombre y número de otra persona puede ver su resultado.

## 6. Aplicar la migración en Supabase

Antes: en Supabase → **Database → Backups**, confirma que hay un respaldo reciente (o haz `pg_dump`).

**Opción A — terminal (recomendada):** con `DATABASE_URL` de producción en `.env.local`:
```bash
npm run db:migrate
```
Debe imprimir solo `✔ Migración aplicada: 0004_gift_wishes.sql`. Solo aplica lo pendiente; ejecutarlo otra vez no hace nada.

**Opción B — SQL Editor de Supabase:** pega y ejecuta el contenido completo de
`supabase/migrations/0004_gift_wishes.sql`, y después:
```sql
insert into santa.schema_migrations (name) values ('0004_gift_wishes.sql') on conflict do nothing;
```

**Verificación (solo lectura):**
```sql
select column_name, data_type, is_nullable from information_schema.columns
 where table_schema = 'santa' and table_name = 'participants' and column_name = 'gift_wishes';
select count(*) as participantes, count(gift_wishes) as con_sugerencias from santa.participants;  -- con_sugerencias = 0
select name from santa.schema_migrations order by name;  -- incluye 0004_gift_wishes.sql
```

## 7. Actualizar Vercel (después del paso 6)

No hay variables de entorno nuevas.
* **Si el proyecto está conectado a Git:** haz commit y push a la rama de producción; Vercel despliega solo.
  (Nota: en este repositorio local toda la aplicación sigue sin commit, salvo el commit inicial de Create Next App.)
* **Con la CLI:** `npm i -g vercel`, luego `vercel` (vista previa para revisar) y `vercel --prod`.
* Prueba en la vista previa: ingresar como participante que ya sorteó → debe verse la tarjeta cubierta;
  "Mostrar" → nombre, foto y sugerencias.
* Reversión: "Instant Rollback" en Vercel a la versión anterior funciona aunque la columna exista.

## 8. Importar el nuevo Excel sin duplicar participantes

1. Ingresa como organizador → **Participantes → 🎁 Importar sugerencias de regalo** (no uses "Importar Excel",
   que es para crear personas nuevas y además está bloqueado tras iniciar el sorteo).
2. Sube `santa-secreto-participantes-2026 (1).xlsx`. Comprueba que la columna elegida sea **"Regalo"**
   (si no, elígela en el selector).
3. Revisa el resumen y usa el filtro "Ver" para revisar **Sin coincidencia** y **Conflicto**: esas filas nunca
   se aplican. Corrige esos nombres en el Excel y vuelve a subirlo, o edítalos a mano después.
4. Revisa la columna "Actual / Nuevo". Las filas "Nuevas sugerencias" vienen marcadas; las de "Revisar" márcalas
   solo si estás seguro. Las celdas vacías no borran nada.
5. Pulsa **🎁 Actualizar N sugerencia(s)** → **Sí, actualizar**. Es una sola transacción: o se aplican todas las
   filas marcadas o ninguna. Repetir la importación con el mismo archivo no cambia nada.
6. Usa el filtro **"Sin sugerencias de regalo"** de Participantes para completar a mano a quien falte.

Esta importación nunca crea participantes, ni cambia números, roles, fotos, asignaciones o estados.
