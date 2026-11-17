import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db";
import { AppError } from "../errors";
import { actorFromSession, getSessionByToken } from "../services/auth";
import type { Actor, Session } from "../types";

const isProd = process.env.NODE_ENV === "production";

/** En producción el prefijo __Host- obliga a Secure, Path=/ y sin Domain (no se comparte con subdominios). */
export const SESSION_COOKIE = isProd ? "__Host-santa_sesion" : "santa_sesion";
export const TV_COOKIE = isProd ? "__Host-santa_tv" : "santa_tv";

export async function setAuthCookie(name: string, token: string, expiresAt: Date) {
  (await cookies()).set(name, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function clearAuthCookie(name: string) {
  (await cookies()).set(name, "", { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function readCookie(name: string): Promise<string | undefined> {
  return (await cookies()).get(name)?.value;
}

/** Sesión del participante actual (una consulta por petición gracias a `cache`). */
export const getCurrentSession = cache(async (): Promise<Session | null> => {
  const token = await readCookie(SESSION_COOKIE);
  if (!token) return null;
  const db = await getDb();
  return getSessionByToken(db, token);
});

/** Sesión del televisor (código de presentación). */
export const getPresentationSession = cache(async (): Promise<Session | null> => {
  const token = await readCookie(TV_COOKIE);
  if (!token) return null;
  const session = await getSessionByToken(await getDb(), token);
  return session?.kind === "PRESENTATION" ? session : null;
});

// ---------------------------------------------------------------------------
// Guardas para páginas (redirigen)
// ---------------------------------------------------------------------------
export async function requireParticipantPage(): Promise<Session & { participant: NonNullable<Session["participant"]> }> {
  const session = await getCurrentSession();
  if (!session || !session.participant) {
    const hadCookie = !!(await readCookie(SESSION_COOKIE));
    redirect(hadCookie ? "/ingresar?motivo=expirada" : "/ingresar");
  }
  return session as Session & { participant: NonNullable<Session["participant"]> };
}

export async function requireOrganizerPage() {
  const session = await requireParticipantPage();
  if (session.participant.role !== "ORGANIZER") redirect("/inicio?motivo=sin-permiso");
  return session;
}

// ---------------------------------------------------------------------------
// Guardas para Server Actions / Route Handlers (lanzan errores)
// ---------------------------------------------------------------------------
export async function requireActor(): Promise<Actor> {
  const session = await getCurrentSession();
  if (!session || !session.participant) throw new AppError("UNAUTHENTICATED");
  return actorFromSession(session);
}

export async function requireOrganizerActor(): Promise<Actor> {
  const actor = await requireActor();
  if (actor.role !== "ORGANIZER") throw new AppError("FORBIDDEN");
  return actor;
}

/** Identificador de la red del cliente, para limitar intentos. */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "local";
}

/** Para Route Handlers que modifican datos: exige que la petición venga de nuestro propio sitio. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) throw new AppError("FORBIDDEN");
}
