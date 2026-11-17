"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { revealMySecretFriendAction } from "@/app/sorteo/actions";
import { hasGiftWishes, splitLinks } from "@/domain/gift-wishes";
import { Avatar } from "./avatar";
import { useToast } from "./ui/toast";

export interface SecretFriend {
  id: string;
  fullName: string;
  photoUrl: string | null;
}

const CARD_FRAME =
  "relative mx-auto w-full max-w-md overflow-hidden rounded-[2rem] bg-snow text-ink shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)]";

const BIG_BUTTON =
  "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-6 py-3 text-base font-black uppercase tracking-wide transition active:scale-[0.98] disabled:opacity-70 sm:w-auto sm:text-lg";

function GiftRibbonTop() {
  return (
    <>
      <div aria-hidden className="absolute inset-y-0 left-1/2 w-10 -translate-x-1/2 bg-gradient-to-b from-berry-600/8 via-berry-600/5 to-berry-600/8" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-3 bg-[repeating-linear-gradient(135deg,var(--color-berry-600)_0_14px,var(--color-snow)_14px_28px)]" />
    </>
  );
}

/** Sección "¿Qué le gustaría recibir?". Respeta el texto original y sus saltos de línea. */
export function GiftWishesSection({ giftWishes }: { giftWishes: string | null }) {
  if (!hasGiftWishes(giftWishes)) {
    return (
      <section aria-label="Sugerencias de regalo" className="mt-6 rounded-2xl border border-dashed border-pine-700/25 bg-cream/70 px-4 py-4 text-center">
        <p className="text-sm font-semibold leading-relaxed text-pine-700 sm:text-base">
          🎄 Tu amigo secreto todavía no ha compartido sus ideas de regalo. ¡Tendrás que poner a prueba tu creatividad!
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="titulo-sugerencias" className="mt-6 rounded-2xl bg-cream px-4 py-4 text-left shadow-inner sm:px-5">
      <h3 id="titulo-sugerencias" className="font-display text-lg font-bold text-berry-700 sm:text-xl">
        🎁 ¿Qué le gustaría recibir?
      </h3>
      <p
        data-testid="gift-wishes"
        className="mt-2 whitespace-pre-wrap break-words text-base leading-relaxed text-ink [overflow-wrap:anywhere]"
      >
        {splitLinks(giftWishes).map((s, i) =>
          s.type === "link" ? (
            <a
              key={i}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              referrerPolicy="no-referrer"
              aria-label={`${s.value} (se abre en una pestaña nueva)`}
              className="font-semibold text-berry-700 underline decoration-berry-700/40 underline-offset-2 hover:decoration-berry-700"
            >
              {s.value}
            </a>
          ) : (
            s.value
          ),
        )}
      </p>
      <p className="mt-3 border-t border-ink/10 pt-3 text-sm text-ink-soft">
        ✨ Estas son algunas ideas. ¡También puedes sorprenderlo con algo diferente!
      </p>
    </section>
  );
}

/** Contenido revelado: fotografía, nombre y sugerencias. Solo se monta con datos ya autorizados. */
export function SecretFriendCard({
  friend,
  giftWishes,
  cardLabel,
  footer,
}: {
  friend: SecretFriend;
  giftWishes: string | null;
  cardLabel?: string;
  footer?: React.ReactNode;
}) {
  return (
    <article className={CARD_FRAME} aria-label="Tu amigo secreto">
      <GiftRibbonTop />
      <div className="relative px-6 pb-8 pt-9 text-center sm:px-8">
        <p className="font-display text-xl font-bold text-pine-700 sm:text-2xl">🎄 ¡La magia de la Navidad ha decidido!</p>
        <p className="mt-2 text-ink-soft">Este año tendrás la misión de sorprender a…</p>

        <div className="relative mx-auto mt-6 w-fit">
          <div aria-hidden className="absolute -inset-3 rounded-full bg-[conic-gradient(from_0deg,var(--color-gold-300),var(--color-berry-500),var(--color-gold-500),var(--color-pine-500),var(--color-gold-300))] opacity-80 blur-[2px]" />
          <Avatar name={friend.fullName} src={friend.photoUrl} size={168} ring={false} className="relative border-4 border-snow" />
          <span aria-hidden className="absolute -right-3 -top-2 text-4xl animate-float">
            ⭐
          </span>
        </div>

        <h2 className="mt-6 font-display text-3xl font-black uppercase leading-tight tracking-wide text-berry-700 sm:text-4xl">
          <span aria-hidden>🎁 </span>
          {friend.fullName}
          <span aria-hidden> 🎁</span>
        </h2>
        <p className="mt-4 font-semibold text-pine-700">¡Guarda el secreto y prepara una sorpresa inolvidable!</p>

        <GiftWishesSection giftWishes={giftWishes} />

        {cardLabel && (
          <p className="mt-5 inline-block rounded-full bg-cream px-3 py-1 text-xs font-bold uppercase tracking-widest text-ink-soft">
            Tarjeta {cardLabel}
          </p>
        )}
        {footer}
      </div>
    </article>
  );
}

/** Tarjeta cubierta: no contiene NINGÚN dato del destinatario (ni nombre, ni foto, ni sugerencias). */
function CoveredCard({ cardLabel, loading, onShow }: { cardLabel?: string; loading: boolean; onShow: () => void }) {
  const reduced = useReducedMotion();
  return (
    <article className={CARD_FRAME} aria-label="Resultado oculto">
      <GiftRibbonTop />
      <div className="relative px-6 pb-8 pt-9 text-center sm:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,color-mix(in_oklab,var(--color-gold-300)_30%,transparent),transparent_60%)]" />

        {/* Regalo cerrado */}
        <motion.div
          aria-hidden
          className="relative mx-auto mt-2 h-44 w-44"
          animate={reduced ? undefined : { rotate: [0, -3, 3, -2, 0], y: [0, -4, 0] }}
          transition={reduced ? undefined : { duration: 2.4, repeat: Infinity, repeatDelay: 1.6, ease: "easeInOut" }}
        >
          <span className="absolute -left-3 top-2 text-2xl animate-float">✨</span>
          <span className="absolute -right-2 top-10 text-xl animate-float [animation-delay:1.5s]">❄️</span>
          <div className="absolute inset-x-3 bottom-0 top-14 rounded-2xl bg-gradient-to-br from-berry-500 to-berry-800 shadow-xl">
            <div className="absolute inset-y-0 left-1/2 w-7 -translate-x-1/2 bg-gold-400" />
            <div className="absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 bg-gold-400/90" />
            <span className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-pine-800 text-3xl font-black text-gold-300 ring-4 ring-gold-400">
              ?
            </span>
          </div>
          <div className="absolute inset-x-0 top-7 h-10 rounded-xl bg-gradient-to-br from-berry-500 to-berry-700 shadow-lg">
            <div className="absolute inset-y-0 left-1/2 w-7 -translate-x-1/2 bg-gold-400" />
          </div>
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-4xl">🎀</span>
        </motion.div>

        <h2 className="mt-6 font-display text-2xl font-black text-berry-700 sm:text-3xl">🎄 ¡Tu amigo secreto está listo!</h2>
        <p className="mx-auto mt-2 max-w-xs text-ink-soft">Su identidad permanece oculta hasta que decidas descubrirla.</p>

        <div className="mt-6">
          <button
            type="button"
            onClick={onShow}
            disabled={loading}
            aria-busy={loading}
            className={`${BIG_BUTTON} border border-berry-300/40 bg-gradient-to-b from-berry-500 to-berry-700 text-white shadow-[0_10px_28px_-10px_rgb(220_42_66/0.8)] hover:brightness-110`}
          >
            {loading ? "✨ Descubriendo…" : "👁️ MOSTRAR MI AMIGO SECRETO"}
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-soft">Asegúrate de que nadie esté mirando tu pantalla 🤫</p>

        {cardLabel && (
          <p className="mt-5 inline-block rounded-full bg-cream px-3 py-1 text-xs font-bold uppercase tracking-widest text-ink-soft">
            Tarjeta {cardLabel}
          </p>
        )}
      </div>
    </article>
  );
}

type View = { kind: "hidden" } | { kind: "loading" } | { kind: "shown"; friend: SecretFriend; giftWishes: string | null };

/**
 * Resultado del sorteo con privacidad por defecto.
 * - Siempre empieza OCULTO (no se persiste nada: ni localStorage ni cookies).
 * - Los datos del destinatario solo se piden al servidor al pulsar "Mostrar" (solicitud autenticada
 *   que devuelve únicamente la asignación propia) y se descartan de la memoria al ocultar.
 * - Mostrar/ocultar no registra participación ni reclama tarjetas: es solo lectura.
 */
export function PrivateSecretFriend({ cardLabel }: { cardLabel?: string }) {
  const reduced = useReducedMotion();
  const toast = useToast();
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "hidden" });
  const request = useRef(0);
  const hideButton = useRef<HTMLButtonElement>(null);
  const showButtonWrap = useRef<HTMLDivElement>(null);

  const hide = useCallback(() => {
    request.current++; // invalida cualquier respuesta en camino
    setView({ kind: "hidden" });
  }, []);

  // Al salir de la página (incluida la caché de "atrás" del navegador) o desmontarse, vuelve a ocultarse.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) hide();
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", onPageShow);
      hide();
    };
  }, [hide]);

  const show = async () => {
    if (view.kind !== "hidden") return;
    const id = ++request.current;
    setView({ kind: "loading" });
    try {
      const res = await revealMySecretFriendAction();
      if (id !== request.current) return;
      if (!res.ok) {
        setView({ kind: "hidden" });
        toast(res.message, "error");
        if (res.code === "UNAUTHENTICATED") router.replace("/ingresar?motivo=expirada");
        return;
      }
      setView({ kind: "shown", friend: res.data.receiver, giftWishes: res.data.giftWishes });
      requestAnimationFrame(() => hideButton.current?.focus({ preventScroll: true }));
    } catch {
      if (id !== request.current) return;
      setView({ kind: "hidden" });
      toast("No pudimos conectar. Revisa tu internet e inténtalo de nuevo.", "error");
    }
  };

  const onHide = () => {
    hide();
    requestAnimationFrame(() => showButtonWrap.current?.querySelector("button")?.focus({ preventScroll: true }));
  };

  const motionProps = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : {
        initial: { opacity: 0, rotateY: -80, scale: 0.94 },
        animate: { opacity: 1, rotateY: 0, scale: 1 },
        exit: { opacity: 0, rotateY: 80, scale: 0.94 },
        transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div className="[perspective:1400px]">
      <p className="sr-only" aria-live="polite">
        {view.kind === "shown" ? `Tu amigo secreto es ${view.friend.fullName}.` : view.kind === "hidden" ? "Resultado oculto." : ""}
      </p>
      <AnimatePresence mode="wait" initial={false}>
        {view.kind === "shown" ? (
          <motion.div key="shown" {...motionProps}>
            <SecretFriendCard
              friend={view.friend}
              giftWishes={view.giftWishes}
              cardLabel={cardLabel}
              footer={
                <div className="mt-6">
                  <button
                    ref={hideButton}
                    type="button"
                    onClick={onHide}
                    className={`${BIG_BUTTON} border-2 border-pine-700/25 bg-snow text-pine-800 hover:bg-cream`}
                  >
                    🙈 OCULTAR MI AMIGO SECRETO
                  </button>
                </div>
              }
            />
          </motion.div>
        ) : (
          <motion.div key="covered" ref={showButtonWrap} {...motionProps}>
            <CoveredCard cardLabel={cardLabel} loading={view.kind === "loading"} onShow={show} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
