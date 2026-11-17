"use client";

import { Gift, Hash } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Input, Label } from "@/components/ui/primitives";
import { NameCombobox } from "@/components/name-combobox";
import { loginAction } from "./actions";

export function LoginForm({ names }: { names: string[] }) {
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (!fullName.trim()) return setError("Escoge tu nombre de la lista.");
    if (!identifier.trim()) return setError("Escribe tu número identificador.");
    startTransition(async () => {
      try {
        const res = await loginAction({ fullName, identifier });
        if (res && !res.ok) setError(res.message);
      } catch {
        setError("No pudimos conectar. Revisa tu internet e inténtalo de nuevo.");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="nombre">Tu nombre completo</Label>
        <NameCombobox id="nombre" names={names} value={fullName} onChange={setFullName} />
      </div>
      <div>
        <Label htmlFor="identificador">Tu número identificador</Label>
        <div className="relative">
          <Hash className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-white/45" aria-hidden />
          <Input
            id="identificador"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={6}
            placeholder="Ej: 07"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value.replace(/\D/g, ""))}
            className="h-14 rounded-2xl pl-12 text-lg tracking-[0.3em]"
            aria-describedby="identificador-ayuda"
          />
        </div>
        <p id="identificador-ayuda" className="mt-1.5 text-xs text-white/55">
          Es el número que te dieron los organizadores (con sus ceros, por ejemplo 07).
        </p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" size="xl" className="w-full" loading={pending} icon={<Gift className="size-6" aria-hidden />}>
        Ingresar
      </Button>
    </form>
  );
}
