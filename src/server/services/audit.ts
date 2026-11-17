import type { Db } from "../db/types";
import type { Actor } from "../types";

export async function audit(
  db: Db,
  actor: Actor,
  action: string,
  scope: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await db.query(
    `insert into santa.audit_logs (event_id, actor_id, actor_name, action, scope, details)
     values ($1, $2, (select full_name from santa.participants where id = $2), $3, $4, $5::jsonb)`,
    [actor.eventId, actor.participantId, action, scope, JSON.stringify(details)],
  );
}

export interface AuditEntry {
  id: number;
  actorName: string | null;
  action: string;
  scope: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
}

export async function listAudit(db: Db, eventId: string, limit = 200): Promise<AuditEntry[]> {
  const { rows } = await db.query<{
    id: number;
    actor_name: string | null;
    action: string;
    scope: string | null;
    details: Record<string, unknown>;
    created_at: Date;
  }>(
    `select id, actor_name, action, scope, details, created_at
       from santa.audit_logs where event_id = $1 order by created_at desc, id desc limit $2`,
    [eventId, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    actorName: r.actor_name,
    action: r.action,
    scope: r.scope,
    details: r.details ?? {},
    createdAt: r.created_at,
  }));
}
