# Progreso del proyecto — Santa Secreto

Última actualización: 2026-11-10

| Fase | Estado | Notas |
| --- | --- | --- |
| 1. Arquitectura | ✅ | `docs/ARQUITECTURA.md` |
| 2. Preparación | ✅ | Next.js 16.4, React 19.3, Tailwind 4, TypeScript, Vitest, Playwright |
| 3. Base de datos | ✅ | 3 migraciones: esquema + constraints, 17 funciones transaccionales, endurecimiento Supabase y bucket privado |
| 4. Identificación | ✅ | Nombre + número, sesiones con hash, cookies `__Host-`, límite de intentos, rol desde la BD |
| 5. Administración | ✅ | Resumen en tiempo real, CRUD, importación xlsx/csv con vista previa, fotos, eventos, auditoría, emergencia |
| 6. Motor del sorteo | ✅ | Derangement uniforme con CSPRNG, doble validación, tarjetas atómicas e idempotentes |
| 7. Entrega | ✅ | Panel móvil, turnos aleatorio/manual, TV con código, ruleta de fotos, confirmación/corrección, celebración |
| 8. Calidad | ✅ | Ver resultados abajo |
| 10. Sugerencias de regalo + resultado oculto | ✅ | Migración `0004_gift_wishes.sql` (pendiente de aplicar en producción). Ver ARQUITECTURA §11–12 |
| 9. Producción | ⏳ | Proyecto listo; faltan acciones del propietario (cuentas de Supabase y Vercel) |

## Resultados verificados (ejecutados)

- `npm run lint` → sin errores ni advertencias.
- `npm run typecheck` → sin errores.
- `npm test` → pruebas unitarias e integración sobre PostgreSQL (PGlite).
- `npm run test:concurrency` → 5 pruebas sobre PostgreSQL 18 nativo con 25 conexiones simultáneas.
- `npm run build` → compilación de producción sin advertencias.
- `npm run test:e2e` → recorrido completo en Chromium (build de producción).

## Pendiente (requiere al propietario)

1. Crear el proyecto de Supabase y copiar credenciales a `.env.local` (README §4).
2. `npm run db:migrate` y `npm run db:bootstrap -- --nombre "…" --id 00`.
3. Crear el proyecto en Vercel con las variables de entorno (README §5) y elegir el subdominio.

## Ideas para el futuro (no requeridas)

- Código QR del enlace para imprimir en la invitación.
