/**
 * Señales en tiempo real (Supabase Realtime Broadcast).
 * IMPORTANTE: las señales NUNCA llevan datos del sorteo. Solo indican qué parte cambió para que
 * cada cliente vuelva a consultar al servidor, que aplica la autorización.
 */
export type SignalKind = "cards" | "event" | "participants" | "delivery";

export function channelName(eventId: string): string {
  return `santa-${eventId}`;
}

export async function notify(eventId: string, ...kinds: SignalKind[]): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return; // Sin Realtime: los clientes usan polling.
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const channel = client.channel(channelName(eventId));
    await Promise.all(kinds.map((kind) => channel.httpSend("signal", { kind, at: Date.now() }, { timeout: 3000 })));
    await client.removeChannel(channel);
  } catch (e) {
    // La consistencia no depende de Realtime: si falla, los clientes se actualizan por polling.
    console.warn("[santa] no se pudo enviar la señal de tiempo real:", (e as Error).message);
  }
}
