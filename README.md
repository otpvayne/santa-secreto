<div align="center">

# 🎅 Santa Secreto 🎄

### El amigo secreto de la familia, desde el celular — con sorteo justo, tarjetas navideñas y una gran revelación en el televisor.

<br/>

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
<br/>
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Deploy-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-tested-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)

<br/>

[✨ Qué incluye](#1-qué-incluye) ·
[🚀 Probar en 3 minutos](#3-probarla-en-tu-computador-en-3-minutos) ·
[🎲 Cómo funciona el sorteo](#6-cómo-funciona-el-sorteo) ·
[📋 Guía del organizador](#8-guía-del-organizador) ·
[🔐 Seguridad](#10-seguridad-y-privacidad)

</div>

---

## 🎁 ¿Cómo se vive?

<table>
<tr>
<td align="center" width="25%">📱<br/><b>1. Ingresa</b><br/><sub>Cada persona entra desde su celular con su <b>nombre</b> y su <b>número</b>.</sub></td>
<td align="center" width="25%">🃏<br/><b>2. Escoge una tarjeta</b><br/><sub>Tarjetas navideñas interactivas; si dos tocan la misma, solo una la gana.</sub></td>
<td align="center" width="25%">🎉<br/><b>3. Descubre</b><br/><sub>Foto, animación y confeti revelan a quién le darás tu regalo.</sub></td>
<td align="center" width="25%">📺<br/><b>4. La Gran Revelación</b><br/><sub>El día de entrega, el TV muestra la ruleta de turnos y celebra cada regalo.</sub></td>
</tr>
</table>

```mermaid
flowchart LR
    A([📝 En preparación]) --> B([🎲 Sorteo abierto])
    B --> C([✅ Listo para la entrega])
    C --> D([📺 La Gran Revelación])
    D --> E([🎄 Completado])
    E --> F([🗄️ Archivado])
```

> [!WARNING]
> **Advertencia de seguridad importante.** Por decisión del propietario, el ingreso usa solo nombre y número
> (sin contraseñas). **Cualquier persona que conozca el nombre y el número de otra puede hacerse pasar por ella**,
> incluso por un organizador. No es autenticación fuerte. Entrega los números en privado. La consulta de emergencia
> y las acciones administrativas quedan auditadas para detectar abusos.

---

## 📑 Índice

1. [Qué incluye](#1-qué-incluye)
2. [Tecnologías](#2-tecnologías)
3. [Probarla en tu computador en 3 minutos (sin crear cuentas)](#3-probarla-en-tu-computador-en-3-minutos)
4. [Configurar Supabase (base de datos, fotos y tiempo real)](#4-configurar-supabase)
5. [Publicar en Vercel](#5-publicar-en-vercel)
6. [Cómo funciona el sorteo](#6-cómo-funciona-el-sorteo)
7. [Roles y permisos](#7-roles-y-permisos)
8. [Guía del organizador: de la preparación a la Navidad](#8-guía-del-organizador)
9. [Pruebas](#9-pruebas)
10. [Seguridad y privacidad](#10-seguridad-y-privacidad)
11. [Solución de problemas](#11-solución-de-problemas)
12. [Estructura del proyecto](#12-estructura-del-proyecto)

---

## 1. Qué incluye

- Identificación con nombre (selector con búsqueda) y número. Sesión segura de 14 días.
- Roles **PARTICIPANT** y **ORGANIZER**. Los organizadores también participan en el sorteo.
- Sorteo global válido (nadie se asigna a sí mismo; cada persona da y recibe exactamente una vez).
- Tarjetas navideñas interactivas. Si dos personas tocan la misma tarjeta al mismo tiempo, solo una la obtiene.
- Pantalla de resultado con foto, animación y confeti; consulta posterior desde cualquier dispositivo.
- Panel administrativo: indicadores, seguimiento en tiempo real, búsqueda y filtros.
- Gestión de participantes, importación desde Excel/CSV con vista previa y fotografías privadas.
- Pausa, reinicio controlado y exportación del seguimiento (sin secretos).
- 🔒 Consulta de emergencia auditada.
- Máquina de estados del evento: `DRAFT → DRAW_OPEN → READY_FOR_DELIVERY → DELIVERY_ACTIVE → COMPLETED → ARCHIVED`.
- 🎉 **La Gran Revelación**: panel del organizador en el celular y pantalla de TV sincronizada (turnos aleatorios o manuales,
  confirmación de entregas, corrección auditada, celebración final).
- Varios eventos (uno por año), con copia controlada de participantes.

## 2. Tecnologías

| Parte | Tecnología |
| --- | --- |
| Aplicación | Next.js 16 (App Router), React 19, TypeScript |
| Estilos y animación | Tailwind CSS 4, Motion, Lucide |
| Validación | Zod |
| Base de datos | PostgreSQL en Supabase (funciones transaccionales en SQL) |
| Fotos | Supabase Storage (bucket **privado**) + `sharp` |
| Tiempo real | Supabase Realtime Broadcast (con respaldo por consulta periódica) |
| Pruebas | Vitest, PGlite (PostgreSQL embebido), PostgreSQL nativo embebido, Playwright |
| Publicación | Vercel |

Las decisiones técnicas están explicadas en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## 3. Probarla en tu computador en 3 minutos

Necesitas [Node.js 22 o superior](https://nodejs.org) (recomendado: 24 LTS).

```bash
npm install                 # instala las dependencias
cp .env.example .env.local  # en Windows (PowerShell): Copy-Item .env.example .env.local
npm run db:demo             # crea una base local con 50 personas ficticias
npm run dev                 # inicia la aplicación
```

Abre <http://localhost:3000> e ingresa como **Pablo Monroy** con el número **00** (organizador).
Los demás participantes de demostración usan su posición en la lista (por ejemplo, "Laura Rodríguez" = 01).

En este modo **no necesitas Supabase**: la base de datos es un PostgreSQL embebido (PGlite) guardado en la carpeta
`.data/`, las fotos se guardan en `.data/fotos` y el tiempo real se reemplaza por actualizaciones periódicas.
Es solo para probar: **no lo uses en producción**.

> Para empezar de cero, detén la aplicación y borra la carpeta `.data`. No ejecutes `db:demo` mientras `npm run dev`
> está abierto (la base local solo admite un proceso a la vez).

## 4. Configurar Supabase

### 4.1 Crear el proyecto

1. Entra a <https://supabase.com>, crea una cuenta y luego **New project** (el plan gratuito es suficiente).
2. Elige una región cercana (p. ej. `South America (São Paulo)` o `US East`) y una contraseña segura para la base de datos.
   **Guárdala**: la necesitarás en el siguiente paso.

### 4.2 Copiar las credenciales a `.env.local`

| Variable | Dónde encontrarla |
| --- | --- |
| `DATABASE_URL` | Botón **Connect** (arriba) → **Transaction pooler**. Copia la cadena y reemplaza `[YOUR-PASSWORD]` por tu contraseña. Debe usar el puerto **6543**. |
| `NEXT_PUBLIC_SUPABASE_URL` | **Project Settings → Data API** → Project URL (`https://xxxx.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Project Settings → API Keys** → *Publishable key* (`sb_publishable_…`). Es pública. |
| `SUPABASE_SECRET_KEY` | **Project Settings → API Keys** → *Secret keys* → crea una (`sb_secret_…`). **Nunca** la compartas ni la pongas en una variable `NEXT_PUBLIC_`. |

Ejemplo de `.env.local`:

```env
DATABASE_URL=postgresql://postgres.abcd1234:MiClaveSegura@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
NEXT_PUBLIC_SUPABASE_URL=https://abcd1234.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxx
SUPABASE_PHOTO_BUCKET=participant-photos
```

### 4.3 Crear las tablas y el bucket de fotos

```bash
npm run db:migrate
```

Esto crea el esquema `santa` con todas sus tablas, restricciones y funciones, y el bucket **privado**
`participant-photos`. Puedes ejecutarlo de nuevo sin riesgo: solo aplica lo que falte.

> Alternativa sin terminal: abre **SQL Editor** en Supabase y ejecuta, en orden, los archivos de
> `supabase/migrations/` (`0001…`, `0002…`, `0003…`, `0004…`). Después crea el bucket en **Storage → New bucket**
> con el nombre `participant-photos` y **Public bucket desactivado**.

### 4.4 Crear el evento y el primer organizador

```bash
npm run db:bootstrap -- --nombre "Pablo Monroy" --id 00 --evento "Santa Secreto" --anio 2026
```

Con eso ya puedes ingresar como organizador y registrar al resto de la familia desde la aplicación
(a mano o importando el Excel).

### 4.5 Tiempo real

Realtime Broadcast funciona sin configuración extra. Si en **Realtime → Settings** activaste
"*Allow only private channels*", desactívalo: la aplicación usa canales públicos que **solo transmiten
avisos sin datos** ("algo cambió"); cada pantalla vuelve a pedir la información al servidor, que verifica los permisos.
Si Realtime no está disponible, todo sigue funcionando con actualizaciones periódicas.

## 5. Publicar en Vercel

1. Sube el proyecto a un repositorio de GitHub (el archivo `.env.local` **no** se sube; ya está en `.gitignore`).
2. En <https://vercel.com> → **Add New → Project** → importa el repositorio. Vercel detecta Next.js automáticamente.
3. En **Environment Variables** agrega las mismas cuatro variables de `.env.local`
   (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`)
   y opcionalmente `NEXT_PUBLIC_TIMEZONE` (por defecto `America/Bogota`).
4. Pulsa **Deploy**. Al terminar tendrás una dirección como `https://<nombre-del-proyecto>.vercel.app` con HTTPS.
5. Para una dirección limpia: **Settings → Domains**. Puedes cambiar el subdominio `.vercel.app` (por ejemplo
   `santa-secreto-familia.vercel.app`) o conectar un dominio propio.

Con la CLI: `npm i -g vercel`, luego `vercel` (vista previa) o `vercel --prod` (producción) y `vercel env add` para las variables.

> Las migraciones **no** se ejecutan automáticamente al publicar. Ejecuta `npm run db:migrate` desde tu computador
> (con `DATABASE_URL` de producción) cada vez que agregues una migración nueva.

**Pendiente de tu parte (no se puede hacer sin tus cuentas):** crear el proyecto de Supabase, copiar las credenciales,
ejecutar `db:migrate` y `db:bootstrap`, y crear el proyecto en Vercel. 

## 6. Cómo funciona el sorteo

1. Cuando un organizador pulsa **Iniciar sorteo**, el servidor toma a todos los participantes **activos**.
2. Genera una permutación aleatoria con el generador criptográfico de Node.js (`crypto.randomInt`, barajado
   Fisher–Yates) y la acepta solo si nadie quedó consigo mismo (un *derangement*). Si no, vuelve a barajar
   (en promedio ~2,7 intentos). Así todas las combinaciones válidas son igual de probables, incluidas las parejas mutuas.
3. Valida el resultado en TypeScript y luego **PostgreSQL lo vuelve a validar** dentro de una transacción
   (mismo conjunto de personas, sin repetidos, sin autoasignaciones). Además, restricciones de la base de datos
   impiden físicamente una asignación duplicada o a uno mismo.
4. Se crean tantas tarjetas como participantes. **El número de la tarjeta no es el de ninguna persona y no cambia la
   asignación**: es solo la forma divertida de descubrirla.
5. Al abrir una tarjeta, una función SQL bloquea el evento, reserva la tarjeta de forma atómica, registra la revelación
   y devuelve **solo** el amigo secreto de quien la abrió. Repetir el clic devuelve exactamente el mismo resultado.
6. Cuando **todos** revelaron, el evento pasa solo a **Listo para la entrega**.

## 7. Roles y permisos

| Acción | Participante | Organizador |
| --- | :---: | :---: |
| Ver su foto, su estado y su amigo secreto | ✅ | ✅ |
| Escoger tarjeta (una sola vez) | ✅ | ✅ |
| Panel, participantes, fotos, importación | — | ✅ |
| Iniciar / pausar / reiniciar sorteo, exportar | — | ✅ |
| Consulta de emergencia (auditada) | — | ✅ |
| Dirigir la entrega y la pantalla de TV | — | ✅ |

Los permisos se verifican **en el servidor** en cada página y acción (y otra vez dentro de la base de datos);
ocultar botones es solo comodidad visual. Si a alguien le quitan el rol, pierde el acceso de inmediato.

## 8. Guía del organizador

**Preparación (`En preparación`)**
1. *Administración → Participantes*: agrega personas o usa **Importar Excel** (descarga la plantilla, llénala, súbela,
   revisa la vista previa fila por fila y confirma). Los identificadores conservan los ceros (`07`).
2. Sube las selfies con el botón **Foto** de cada persona (se optimizan y se les quitan los datos de ubicación).
3. Designa a otros organizadores (rol *Organizador*). Siempre debe quedar al menos uno.

**Sorteo (`Sorteo abierto`)**
4. *Administración → Sorteo → Iniciar sorteo*. Comparte el enlace de la aplicación por WhatsApp.
5. Sigue en *Resumen* quién falta (filtro "Pendientes"). Puedes **pausar** sin perder resultados.
6. Si necesitas cambiar la lista: **Reiniciar sorteo** (pide escribir REINICIAR y un motivo; quien ya reveló deberá repetir).

**Día de entrega (`La Gran Revelación`)**
7. *Administración → Entrega → Iniciar La Gran Revelación*.
8. En el televisor abre `https://tu-sitio/tv` y escribe el código que genera tu celular (válido 15 minutos, un uso).
9. Pulsa **🎲 Elegir siguiente participante** (o modo **Manual**). El TV muestra una ruleta de fotos y "¡ES TU TURNO!".
10. Si necesitas comprobar quién debe entregar, pulsa **Validar quién debe entregar** (solo en tu celular; queda auditado).
11. **Confirmar entrega** → el TV celebra la revelación. Si alguien no está, **Omitir** (sigue pendiente).
    Si confirmaste por error, **Corregir** en el historial (pide motivo).
12. Al terminar, **Finalizar evento** → el TV muestra "🎄 ¡FELIZ NAVIDAD!". Luego puedes **archivarlo** en *Evento*.

**Año siguiente:** *Evento → Nuevo evento* (puede copiar nombres, números, roles y fotos; nunca asignaciones) y luego **Activar**.

## 9. Pruebas

```bash
npm run lint              # revisión de estilo y errores comunes
npm run typecheck         # verificación de tipos
npm test                  # pruebas unitarias e integración (PostgreSQL real vía PGlite)
npm run test:concurrency  # concurrencia REAL: PostgreSQL nativo con 25 conexiones simultáneas
npm run build             # compilación de producción
npm run test:e2e          # navegador real (requiere `npm run build` antes)
npm run check             # todo lo anterior en orden
```

Qué se comprueba (resumen): sorteo con 2, 3, 7, 50 y de 2 a 120 participantes; uniformidad estadística;
nadie se asigna a sí mismo; sin duplicados ni faltantes; organizadores incluidos; asignaciones estables;
una tarjeta por persona y una persona por tarjeta, incluso con 50 solicitudes simultáneas; reintentos
idempotentes; permisos (incluido intentar falsificar el rol); sesiones expiradas; aislamiento entre eventos;
fotos sin EXIF y validadas por contenido; importación sin parciales; estados del evento; reinicio limpio;
entrega sin duplicados; pantalla de TV sin secretos; y un recorrido completo en navegador con varios
celulares, carrera por la misma tarjeta, TV vinculado y celebración final.

## 10. Seguridad y privacidad

- Todo el acceso a datos ocurre en el servidor. El navegador nunca recibe la clave secreta ni habla con la base de datos.
- Tablas en un esquema (`santa`) que la API pública de Supabase no expone, con RLS activado y permisos revocados.
- Sesión en cookie `HttpOnly`, `SameSite=Lax`, `Secure` y `__Host-` en producción; en la base solo se guarda el hash del token.
- Límite de intentos fallidos por red y por nombre (guardado en PostgreSQL).
- Consultas parametrizadas (sin inyección SQL); React escapa el contenido (sin XSS); Server Actions verifican el origen (CSRF).
- Las asignaciones nunca se envían en masa al navegador, ni en los mensajes de tiempo real, ni en exportaciones normales.
- Fotos en bucket privado, entregadas por el servidor solo a quien corresponde.
- Sin analítica ni rastreadores de terceros.
- Para eliminar datos: *Evento → (evento archivado) → Borrar fotos / Borrar evento*.
- **Recordatorio:** el ingreso por nombre + número no protege contra alguien que conozca esos datos.

## 11. Solución de problemas

| Problema | Solución |
| --- | --- |
| "Falta la variable de entorno DATABASE_URL" | Crea `.env.local` a partir de `.env.example`. En Vercel, revisa *Settings → Environment Variables* y vuelve a desplegar. |
| "No pudimos conectarnos con la base de datos" | Verifica la contraseña dentro de `DATABASE_URL`, que uses el *Transaction pooler* (puerto 6543) y que el proyecto de Supabase no esté pausado (los proyectos gratuitos se pausan tras una semana sin uso: entra al panel y reactívalo). |
| Error de certificado SSL | Deja `DATABASE_SSL` sin definir (cifrado sin verificación) o define `DATABASE_SSL=verify` con `DATABASE_CA_CERT` (certificado de Supabase). |
| Las fotos no se suben | Revisa `SUPABASE_SECRET_KEY` y que exista el bucket `participant-photos` (ejecuta `npm run db:migrate`). |
| Las pantallas tardan unos segundos en actualizarse | Realtime no está conectado: revisa las variables `NEXT_PUBLIC_SUPABASE_*`. Aun así funciona con actualización periódica. |
| Alguien olvidó su número | Un organizador lo ve en *Participantes*. |
| Alguien perdió el celular y no recuerda a quién regala | Puede ingresar desde otro dispositivo y verá su resultado. Si no, *Emergencia* (queda auditado). |
| "Demasiados intentos" | Espera 10 minutos. |
| No puedo agregar personas | El sorteo ya fue generado. Reinícialo desde *Sorteo* (las asignaciones actuales se invalidan). |
| En local: "database is locked" / errores de PGlite | Cierra `npm run dev` antes de ejecutar `npm run db:demo`, o borra `.data/` para empezar de cero. |

## 12. Estructura del proyecto

```
src/
  app/                 Páginas, Server Actions (actions.ts) y rutas API
    ingresar/ inicio/ sorteo/      Participante
    admin/                         Panel del organizador
    tv/ presentacion/              Pantalla del televisor
    api/                           Fotos, tarjetas, estado del TV, exportaciones
  components/          Componentes visuales reutilizables
  domain/              Reglas puras: derangement, estados, normalización, permisos de fotos
  hooks/               Tiempo real (Broadcast + polling)
  lib/                 Validación (Zod), formato, utilidades
  server/              Lógica del servidor
    db/                Conexión (pg / PGlite) y migraciones
    services/          Casos de uso: auth, participantes, sorteo, entrega, eventos, auditoría
    auth/              Sesiones y guardas de autorización
    storage/ images.ts Fotos privadas
supabase/migrations/   SQL versionado (esquema, funciones transaccionales, seguridad)
scripts/               db.ts (migrar, bootstrap, demo) y servidor de pruebas E2E
tests/                 unit/, integration/, concurrency/, e2e/
docs/                  ARQUITECTURA.md y PROGRESO.md
```


---

<div align="center">

Hecho con ❤️ y mucho 🎄 para la familia.

<sub>¡Feliz Navidad! 🎅🎁⛄</sub>

</div>
