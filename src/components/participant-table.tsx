"use client";

import { ArrowDownAZ, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { normalizeName } from "@/domain/normalize";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Avatar } from "./avatar";
import { Badge, Input, Select } from "./ui/primitives";

export interface TableParticipant {
  id: string;
  fullName: string;
  identifier: string;
  role: "PARTICIPANT" | "ORGANIZER";
  isActive: boolean;
  photoUrl: string | null;
  revealedAt: Date | string | null;
  /** Solo en el panel administrativo. undefined = la vista no muestra sugerencias. */
  giftWishes?: string | null;
}

type Filter = "all" | "pending" | "done" | "organizers" | "inactive" | "no-wishes";
type Sort = "name" | "identifier" | "revealed";

/** Tabla de participantes: búsqueda, filtros y orden. En celular se muestra como lista de tarjetas. */
export function ParticipantTable({
  rows,
  drawExists,
  actions,
  initialFilter = "all",
}: {
  rows: TableParticipant[];
  drawExists: boolean;
  actions?: (row: TableParticipant) => ReactNode;
  initialFilter?: Filter;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [sort, setSort] = useState<Sort>("name");

  const visible = useMemo(() => {
    const q = normalizeName(query);
    const list = rows.filter((r) => {
      if (q && !normalizeName(r.fullName).includes(q) && !r.identifier.includes(q)) return false;
      if (filter === "pending") return r.isActive && !r.revealedAt;
      if (filter === "done") return !!r.revealedAt;
      if (filter === "organizers") return r.role === "ORGANIZER";
      if (filter === "inactive") return !r.isActive;
      if (filter === "no-wishes") return !r.giftWishes;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "identifier") return a.identifier.localeCompare(b.identifier, "es", { numeric: true });
      if (sort === "revealed") {
        const ta = a.revealedAt ? new Date(a.revealedAt).getTime() : Infinity;
        const tb = b.revealedAt ? new Date(b.revealedAt).getTime() : Infinity;
        return ta - tb || a.fullName.localeCompare(b.fullName, "es");
      }
      return a.fullName.localeCompare(b.fullName, "es");
    });
  }, [rows, query, filter, sort]);
  const showsWishes = rows.some((r) => r.giftWishes !== undefined);
  const wishesMark = (r: TableParticipant) =>
    r.giftWishes === undefined ? null : r.giftWishes ? (
      <span className="ml-1.5 text-xs font-semibold text-gold-300" title={r.giftWishes}>
        🎁<span className="sr-only"> Tiene sugerencias de regalo</span>
      </span>
    ) : (
      <span className="ml-1.5 text-xs text-white/40" title="Sin sugerencias de regalo">
        ·<span className="sr-only"> Sin sugerencias de regalo</span>
      </span>
    );

  const statusBadge = (r: TableParticipant) =>
    !r.isActive ? (
      <Badge tone="neutral">Inactivo</Badge>
    ) : r.revealedAt ? (
      <Badge tone="success">Completado</Badge>
    ) : drawExists ? (
      <Badge tone="warning">Pendiente</Badge>
    ) : (
      <Badge tone="neutral">Pendiente</Badge>
    );

  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/45" aria-hidden />
          <Input
            aria-label="Buscar participante"
            placeholder="Buscar por nombre o número…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select aria-label="Filtrar" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">Todos ({rows.length})</option>
          <option value="pending">Pendientes ({rows.filter((r) => r.isActive && !r.revealedAt).length})</option>
          <option value="done">Completados ({rows.filter((r) => r.revealedAt).length})</option>
          <option value="organizers">Organizadores</option>
          <option value="inactive">Inactivos</option>
          {showsWishes && (
            <option value="no-wishes">Sin sugerencias de regalo ({rows.filter((r) => !r.giftWishes).length})</option>
          )}
        </Select>
        <div className="relative">
          <ArrowDownAZ className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/45" aria-hidden />
          <Select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="pl-10">
            <option value="name">Nombre</option>
            <option value="identifier">Número</option>
            <option value="revealed">Fecha de participación</option>
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="glass rounded-2xl p-6 text-center text-white/60">No hay participantes que coincidan.</p>
      ) : (
        <>
          {/* Celular: tarjetas */}
          <ul className="space-y-2 md:hidden">
            {visible.map((r) => (
              <li key={r.id} className={cn("glass rounded-2xl p-3", !r.isActive && "opacity-60")}>
                <div className="flex items-center gap-3">
                  <Avatar name={r.fullName} src={r.photoUrl} size={44} ring={false} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {r.fullName}
                      {wishesMark(r)}
                    </p>
                    <p className="text-xs text-white/60">
                      N.º <span className="font-mono">{r.identifier}</span>
                      {r.role === "ORGANIZER" && " · Organizador"}
                      {r.revealedAt && ` · ${formatDateTime(r.revealedAt)}`}
                    </p>
                  </div>
                  {statusBadge(r)}
                </div>
                {actions && <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">{actions(r)}</div>}
              </li>
            ))}
          </ul>

          {/* Escritorio: tabla */}
          <div className="glass hidden overflow-x-auto rounded-2xl md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/55">
                <tr>
                  <th className="px-4 py-3">Participante</th>
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Estado del sorteo</th>
                  <th className="px-4 py-3">Fecha de participación</th>
                  {actions && <th className="px-4 py-3 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className={cn("border-b border-white/5 last:border-0 hover:bg-white/[0.03]", !r.isActive && "opacity-60")}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.fullName} src={r.photoUrl} size={38} ring={false} />
                        <span className="font-semibold">
                          {r.fullName}
                          {wishesMark(r)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono">{r.identifier}</td>
                    <td className="px-4 py-2.5">
                      {r.role === "ORGANIZER" ? <Badge tone="warning">Organizador</Badge> : <span className="text-white/70">Participante</span>}
                    </td>
                    <td className="px-4 py-2.5">{statusBadge(r)}</td>
                    <td className="px-4 py-2.5 text-white/70">{formatDateTime(r.revealedAt)}</td>
                    {actions && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1.5">{actions(r)}</div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
