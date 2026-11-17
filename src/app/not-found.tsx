import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl" aria-hidden>
        🎁
      </p>
      <h1 className="mt-4 font-display text-3xl font-bold">Este regalo no existe</h1>
      <p className="mt-2 text-white/70">La página que buscas no está aquí.</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-berry-600 px-5 font-bold hover:bg-berry-500">
        Ir al inicio
      </Link>
    </main>
  );
}
