"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCog,
  Gift,
  LayoutDashboard,
  PartyPopper,
  ScrollText,
  ShieldAlert,
  Tv,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard, exact: true },
  { href: "/admin/participantes", label: "Participantes", icon: Users },
  { href: "/admin/sorteo", label: "Sorteo", icon: Gift },
  { href: "/admin/entrega", label: "Entrega", icon: PartyPopper },
  { href: "/admin/evento", label: "Evento", icon: CalendarCog },
  { href: "/admin/auditoria", label: "Auditoría", icon: ScrollText },
  { href: "/admin/emergencia", label: "Emergencia", icon: ShieldAlert },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Administración" className="border-b border-white/5 bg-pine-950/50">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
        {ITEMS.map(({ href, label, icon: Icon, ...rest }) => {
          const active = "exact" in rest ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold transition",
                active ? "bg-gold-300 text-pine-950" : "text-white/75 hover:bg-white/10 hover:text-white",
                href === "/admin/emergencia" && !active && "text-berry-300",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          );
        })}
        <a
          href="/presentacion"
          target="_blank"
          rel="noopener"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold text-white/75 hover:bg-white/10 hover:text-white"
        >
          <Tv className="size-4" aria-hidden /> Pantalla TV
        </a>
      </div>
    </nav>
  );
}
