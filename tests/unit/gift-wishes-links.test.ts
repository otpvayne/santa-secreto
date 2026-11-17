import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { safeHref, splitLinks } from "@/domain/gift-wishes";

vi.mock("@/app/sorteo/actions", () => ({ revealMySecretFriendAction: async () => ({ ok: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace() {} }) }));

const joined = (text: string) => splitLinks(text).map((s) => s.value).join("");
const links = (text: string) => splitLinks(text).filter((s) => s.type === "link");

describe("detección de enlaces en sugerencias", () => {
  it("nunca altera el texto: unir los trozos devuelve el original", () => {
    for (const t of [
      "Talla M, ver https://www.amazon.com/dp/B0XX?ref=a&b=c.",
      "(mira www.falabella.com.co/zapatos) o algo parecido!",
      "Sin enlaces, solo una frase con comas, tildes y ñ 🎄",
      "Línea 1\nhttps://a.co/x\n\nLínea 3",
      "javascript:alert(1) https://ok.com",
      "",
    ]) {
      expect(joined(t)).toBe(t);
    }
  });

  it("enlaza http(s) y www., sin la puntuación final", () => {
    expect(links("Ver https://www.amazon.com/dp/B0XX?ref=a&b=c.")).toEqual([
      { type: "link", value: "https://www.amazon.com/dp/B0XX?ref=a&b=c", href: "https://www.amazon.com/dp/B0XX?ref=a&b=c" },
    ]);
    expect(links("(mira www.falabella.com.co/zapatos), gracias")).toEqual([
      { type: "link", value: "www.falabella.com.co/zapatos", href: "https://www.falabella.com.co/zapatos" },
    ]);
    // Paréntesis que sí son parte de la URL.
    expect(links("https://es.wikipedia.org/wiki/Pan_(alimento)")[0].value).toBe("https://es.wikipedia.org/wiki/Pan_(alimento)");
    expect(links("uno: https://a.co/1 y dos: http://b.co/2!")).toHaveLength(2);
  });

  it("nunca enlaza esquemas peligrosos ni direcciones inválidas", () => {
    expect(links("javascript:alert(1)")).toEqual([]);
    expect(links("data:text/html,<script>alert(1)</script>")).toEqual([]);
    expect(links("vbscript:msgbox(1) file:///etc/passwd")).toEqual([]);
    expect(links("https://localhost")).toEqual([]);
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("https://ok.com")).toBe("https://ok.com/");
  });
});

describe("renderizado seguro de la sección de sugerencias", () => {
  it("enlaces reales en pestaña nueva y HTML hostil como texto", async () => {
    const { GiftWishesSection } = await import("@/components/secret-friend-card");
    const hostile = [
      "Talla M: https://www.amazon.com/dp/B0XX?ref=a&b=c",
      "<script>alert(1)</script>",
      '<img src=x onerror="alert(1)">',
      '<a href="javascript:alert(1)">clic</a>',
      'https://ok.com/"onmouseover="alert(1)',
      "javascript:alert(document.cookie)",
    ].join("\n");
    const html = renderToStaticMarkup(createElement(GiftWishesSection, { giftWishes: hostile }));

    // Ninguna etiqueta inyectada: solo los <a> generados por la aplicación.
    expect(html).not.toMatch(/<(script|img|svg|iframe)[\s>]/i);
    expect(html).not.toMatch(/<[^>]+\son\w+=/i);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toMatch(/href="javascript:/i);

    const anchors = [...html.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
    expect(anchors).toHaveLength(2);
    for (const a of anchors) {
      expect(a).toMatch(/href="https:\/\//);
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer nofollow"');
    }
    expect(anchors[0]).toContain('href="https://www.amazon.com/dp/B0XX?ref=a&amp;b=c"');
    // El enlace termina en la comilla: el resto queda como texto y nunca entra en el atributo.
    expect(anchors[1]).toContain('href="https://ok.com/"');
    expect(html).toContain("&quot;onmouseover=&quot;alert(1)");
  });
});
