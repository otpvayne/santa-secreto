"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { runAction, type ActionResult } from "@/server/errors";
import { login, logout } from "@/server/services/auth";
import { SESSION_COOKIE, clearAuthCookie, clientKey, readCookie, setAuthCookie } from "@/server/auth/session";
import { loginSchema, parseInput } from "@/lib/validation/schemas";

export async function loginAction(input: { fullName: string; identifier: string }): Promise<ActionResult> {
  const result = await runAction(async () => {
    const data = parseInput(loginSchema, input);
    const db = await getDb();
    const session = await login(db, data, await clientKey());
    await setAuthCookie(SESSION_COOKIE, session.token, session.expiresAt);
  });
  if (result.ok) redirect("/inicio");
  return result;
}

export async function logoutAction(): Promise<void> {
  const token = await readCookie(SESSION_COOKIE);
  try {
    await logout(await getDb(), token);
  } finally {
    await clearAuthCookie(SESSION_COOKIE);
  }
  redirect("/ingresar");
}
