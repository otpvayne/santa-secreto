import { describe, expect, it } from "vitest";
import { generateDerangement, validateDraw } from "@/domain/derangement";

function ids(n: number) {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

function assertValid(people: string[], pairs: { giver: string; receiver: string }[]) {
  expect(pairs).toHaveLength(people.length);
  // Nadie se asigna a sí mismo.
  for (const p of pairs) expect(p.giver).not.toBe(p.receiver);
  // Cada participante tiene exactamente un destinatario.
  expect(new Set(pairs.map((p) => p.giver)).size).toBe(people.length);
  // Cada destinatario recibe exactamente una vez y nadie falta.
  expect(new Set(pairs.map((p) => p.receiver)).size).toBe(people.length);
  expect([...pairs.map((p) => p.receiver)].sort()).toEqual([...people].sort());
  expect(validateDraw(people, pairs)).toEqual([]);
}

describe("generateDerangement", () => {
  it("funciona con 2 participantes (intercambio mutuo)", () => {
    const people = ids(2);
    for (let i = 0; i < 50; i++) {
      const pairs = generateDerangement(people);
      assertValid(people, pairs);
      expect(pairs.find((p) => p.giver === "p0")!.receiver).toBe("p1");
    }
  });

  it("funciona con 3 participantes", () => {
    const people = ids(3);
    for (let i = 0; i < 200; i++) assertValid(people, generateDerangement(people));
  });

  it("funciona con 50 participantes", () => {
    const people = ids(50);
    for (let i = 0; i < 200; i++) assertValid(people, generateDerangement(people));
  });

  it("funciona con cantidades diferentes (2…120)", () => {
    for (let n = 2; n <= 120; n++) {
      const people = ids(n);
      assertValid(people, generateDerangement(people));
    }
  });

  it("rechaza menos de 2 participantes y listas con repetidos", () => {
    expect(() => generateDerangement([])).toThrow();
    expect(() => generateDerangement(["a"])).toThrow();
    expect(() => generateDerangement(["a", "a", "b"])).toThrow();
  });

  it("es aproximadamente uniforme entre los 9 derangements de 4 personas (incluye parejas mutuas)", () => {
    const people = ids(4);
    const counts = new Map<string, number>();
    const N = 18_000;
    for (let i = 0; i < N; i++) {
      const key = generateDerangement(people).map((p) => p.receiver).join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(9);
    const expected = N / 9;
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan(expected * 0.85);
      expect(c).toBeLessThan(expected * 1.15);
    }
    // Existen asignaciones con parejas mutuas (p0→p1 y p1→p0).
    expect([...counts.keys()].some((k) => k.startsWith("p1,p0"))).toBe(true);
  });
});

describe("validateDraw", () => {
  const people = ["a", "b", "c"];
  it("detecta autoasignaciones", () => {
    expect(validateDraw(people, [
      { giver: "a", receiver: "a" },
      { giver: "b", receiver: "c" },
      { giver: "c", receiver: "b" },
    ])).not.toEqual([]);
  });
  it("detecta destinatarios repetidos y faltantes", () => {
    expect(validateDraw(people, [
      { giver: "a", receiver: "b" },
      { giver: "b", receiver: "a" },
      { giver: "c", receiver: "a" },
    ])).not.toEqual([]);
  });
  it("detecta participantes sin asignación", () => {
    expect(validateDraw(people, [
      { giver: "a", receiver: "b" },
      { giver: "b", receiver: "a" },
    ])).not.toEqual([]);
  });
  it("detecta personas ajenas al sorteo", () => {
    expect(validateDraw(people, [
      { giver: "a", receiver: "b" },
      { giver: "b", receiver: "c" },
      { giver: "c", receiver: "z" },
    ])).not.toEqual([]);
  });
  it("acepta un ciclo válido", () => {
    expect(validateDraw(people, [
      { giver: "a", receiver: "b" },
      { giver: "b", receiver: "c" },
      { giver: "c", receiver: "a" },
    ])).toEqual([]);
  });
});
