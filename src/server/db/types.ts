/**
 * Interfaz mínima de base de datos que usan todos los servicios.
 * Implementada con `pg` (producción, Supabase) y con PGlite (modo local y pruebas).
 * Siempre se usan consultas parametrizadas ($1, $2…): nunca se concatena SQL con datos del usuario.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Ejecuta un script con varias sentencias dentro de una transacción (migraciones). */
  execScript(sql: string): Promise<void>;
  close(): Promise<void>;
}
