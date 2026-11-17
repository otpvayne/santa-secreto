"use client";

import { Check, Search } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { filterNames } from "@/domain/normalize";
import { cn } from "@/lib/cn";

/** Altura máxima del listado (18rem) y mínima cuando el teclado del celular deja poco espacio. */
const LIST_MAX_PX = 288;
const LIST_MIN_PX = 144;

/**
 * Selector de nombre con búsqueda (patrón ARIA combobox). Pensado para ~50 personas en celular.
 * El texto escrito es solo un filtro: `value` cambia únicamente al escoger una opción de la lista,
 * y se invalida (cadena vacía) en cuanto el texto deja de coincidir con la opción escogida.
 */
export function NameCombobox({
  names,
  value,
  onChange,
  id,
  invalid,
}: {
  names: string[];
  value: string;
  onChange: (name: string) => void;
  id?: string;
  invalid?: boolean;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-lista`;
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [maxHeight, setMaxHeight] = useState(LIST_MAX_PX);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(blurTimer.current), []);

  // Con un nombre escogido y sin editar, se muestra la lista completa (con la marca en el escogido).
  const filtered = useMemo(
    () => (value && query === value ? names : filterNames(names, query)),
    [names, query, value],
  );

  const select = (name: string) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
  };

  const openList = () => {
    const i = value && query === value ? names.indexOf(value) : -1;
    setActive(Math.max(0, i));
    setOpen(true);
  };

  const move = (delta: number) => {
    if (!open) return openList();
    setActive((i) => Math.max(0, Math.min(filtered.length - 1, i + delta)));
  };

  // Mantener visible la opción activa (al navegar con flechas o al abrir con un nombre escogido).
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // Que el listado no se salga de la pantalla, incluso con el teclado del celular abierto
  // (visualViewport refleja el área visible real que deja el teclado).
  const fitToViewport = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const vv = window.visualViewport;
    const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const space = visibleBottom - input.getBoundingClientRect().bottom - 16;
    setMaxHeight(Math.max(LIST_MIN_PX, Math.min(LIST_MAX_PX, Math.floor(space))));
  }, []);

  useEffect(() => {
    if (!open) return;
    fitToViewport();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", fitToViewport);
    vv?.addEventListener("scroll", fitToViewport);
    window.addEventListener("resize", fitToViewport);
    window.addEventListener("scroll", fitToViewport, { passive: true });
    return () => {
      vv?.removeEventListener("resize", fitToViewport);
      vv?.removeEventListener("scroll", fitToViewport);
      window.removeEventListener("resize", fitToViewport);
      window.removeEventListener("scroll", fitToViewport);
    };
  }, [open, fitToViewport]);

  return (
    <div className="relative scroll-mt-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-white/45" aria-hidden />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Busca tu nombre…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Editar el texto invalida la selección: hay que volver a escoger de la lista.
            if (value && e.target.value !== value) onChange("");
            setActive(0);
            setOpen(true);
          }}
          onFocus={(e) => {
            // Un cierre pendiente de un blur anterior no debe cerrar el listado recién abierto.
            clearTimeout(blurTimer.current);
            openList();
            // En celular, subir el campo para dejar espacio al listado cuando aparece el teclado.
            if (window.matchMedia("(pointer: coarse)").matches) {
              const el = e.currentTarget.parentElement?.parentElement;
              setTimeout(() => el?.scrollIntoView({ block: "start", behavior: "smooth" }), 300);
            }
          }}
          onClick={() => !open && openList()}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            } else if (e.key === "Enter" && open) {
              // Enter nunca envía el formulario con el listado abierto: escoge la opción activa o no hace nada.
              e.preventDefault();
              if (filtered[active]) select(filtered[active]);
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              setOpen(false);
            }
          }}
          className={cn(
            "h-14 w-full rounded-2xl border bg-pine-950/70 pl-12 pr-4 text-lg text-snow placeholder:text-white/40",
            "transition focus:outline-none focus:ring-2 focus:ring-gold-300/40",
            invalid ? "border-berry-300" : "border-white/15 focus:border-gold-300",
          )}
        />
      </div>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Participantes"
          style={{ maxHeight }}
          className="absolute z-30 mt-2 w-full overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-pine-900 p-1.5 shadow-2xl"
        >
          {filtered.length === 0 ? (
            <li role="presentation" className="px-4 py-3 text-white/60">
              No encontramos participantes con ese nombre
            </li>
          ) : (
            filtered.map((name, i) => (
              <li
                key={name}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={name === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(name);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-xl px-4 py-3 text-base",
                  i === active ? "bg-white/10" : "",
                  name === value && "font-bold text-gold-300",
                )}
              >
                <span>{name}</span>
                {name === value && <Check className="size-4" aria-hidden />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
