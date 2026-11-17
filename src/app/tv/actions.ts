"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { runAction, type ActionResult } from "@/server/errors";
import { redeemPresentationCode } from "@/server/services/auth";
import { TV_COOKIE, clientKey, setAuthCookie } from "@/server/auth/session";
import { parseInput, presentationCodeSchema } from "@/lib/validation/schemas";

export async function redeemTvCodeAction(code: string): Promise<ActionResult> {
  const result = await runAction(async () => {
    const value = parseInput(presentationCodeSchema, code);
    const session = await redeemPresentationCode(await getDb(), value, await clientKey());
    await setAuthCookie(TV_COOKIE, session.token, session.expiresAt);
  });
  if (result.ok) redirect("/presentacion");
  return result;
}
