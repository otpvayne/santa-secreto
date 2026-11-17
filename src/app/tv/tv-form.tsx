"use client";

import { Tv } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Input, Label } from "@/components/ui/primitives";
import { redeemTvCodeAction } from "./actions";

export function TvForm({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await redeemTvCodeAction(code);
          if (res && !res.ok) setError(res.message);
        });
      }}
    >
      <div>
        <Label htmlFor="tv-code">Código de presentación</Label>
        <Input
          id="tv-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          maxLength={6}
          autoComplete="off"
          autoFocus
          className="h-20 text-center font-mono text-5xl font-black tracking-[0.3em]"
        />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" size="xl" className="w-full" loading={pending} disabled={code.length < 6} icon={<Tv className="size-6" aria-hidden />}>
        Conectar pantalla
      </Button>
    </form>
  );
}
