import Link from "next/link";
import { LogOut, Settings2 } from "lucide-react";
import { logoutAction } from "@/app/ingresar/actions";
import { Avatar } from "./avatar";

export function AppHeader({
  name,
  photoUrl,
  isOrganizer,
  eventName,
  showAdminLink = true,
}: {
  name: string;
  photoUrl: string | null;
  isOrganizer: boolean;
  eventName: string;
  showAdminLink?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-pine-950/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/inicio" className="flex min-w-0 items-center gap-2 rounded-xl">
          <span className="text-2xl" aria-hidden>
            🎅
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg font-bold leading-tight text-gold-300">Santa Secreto</span>
            <span className="block truncate text-xs text-white/55">{eventName}</span>
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          {isOrganizer && showAdminLink && (
            <Link
              href="/admin"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-gold-300/30 bg-gold-300/10 px-3 text-sm font-bold text-gold-300 hover:bg-gold-300/20"
            >
              <Settings2 className="size-4" aria-hidden />
              <span className="hidden sm:inline">Administración</span>
              <span className="sm:hidden">Admin</span>
            </Link>
          )}
          <Avatar name={name} src={photoUrl} size={36} ring={false} className="hidden ring-1 ring-white/20 sm:block" />
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white/75 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
