import { expect, test, devices, type Browser, type Page, type Response } from "@playwright/test";

// Deben coincidir con scripts/e2e-server.ts.
const PEOPLE = [
  { name: "Pablo Monroy", id: "00", wishes: "Una camiseta talla M, algo relacionado con fútbol\no una billetera" as string | null },
  { name: "Laura Rodríguez", id: "01", wishes: "Libros de misterio" as string | null },
  { name: "Carlos Martínez", id: "02", wishes: "Audífonos; chocolates & café ☕" as string | null },
  { name: "Camila Gómez", id: "03", wishes: "Plantas 🌱\nUna taza bonita" as string | null },
  { name: "José Pérez", id: "04", wishes: "Cualquier detalle que me sorprenda (ideas: https://www.example.com/regalos?talla=M&color=rojo)." as string | null },
  { name: "Ana María Díaz", id: "05", wishes: null as string | null },
];
const NO_WISHES = "🎄 Tu amigo secreto todavía no ha compartido sus ideas de regalo. ¡Tendrás que poner a prueba tu creatividad!";
const SHOTS = ".data/e2e-results/capturas";

async function newPage(browser: Browser, device: "phone" | "tv" = "phone"): Promise<Page> {
  const ctx = await browser.newContext(
    device === "tv"
      ? { viewport: { width: 1920, height: 1080 }, locale: "es-CO" }
      : { ...devices["Pixel 7"], locale: "es-CO" },
  );
  return ctx.newPage();
}

async function login(page: Page, name: string, id: string) {
  await page.goto("/ingresar");
  const combo = page.getByRole("combobox");
  await combo.fill(name.split(" ")[0]);
  await page.getByRole("option", { name }).click();
  await page.getByLabel("Tu número identificador").fill(id);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/inicio/);
}

const SHOW = "👁️ MOSTRAR MI AMIGO SECRETO";
const HIDE = "🙈 OCULTAR MI AMIGO SECRETO";
const revealedCard = (page: Page) => page.getByRole("article", { name: "Tu amigo secreto", exact: true });

/**
 * Comprueba que el resultado está CUBIERTO: sin nombre, sin foto y sin sugerencias.
 * `fullDocument`: revisa TODO el documento (HTML + payload serializado). Solo tiene sentido justo después de
 * una carga directa: tras ingresar, el documento conserva el payload de /ingresar, que contiene la lista
 * PÚBLICA de nombres del selector de ingreso. En los demás casos se revisa el contenido visible (<main>).
 */
async function expectHidden(page: Page, secretName?: string, fullDocument = false) {
  await expect(page.getByRole("heading", { name: "🎄 ¡Tu amigo secreto está listo!" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Su identidad permanece oculta hasta que decidas descubrirla.")).toBeVisible();
  await expect(page.getByRole("button", { name: SHOW })).toBeVisible();
  await expect(revealedCard(page)).toHaveCount(0);
  await expect(page.getByText("🎁 ¿Qué le gustaría recibir?")).toHaveCount(0);
  await expect(page.getByTestId("gift-wishes")).toHaveCount(0);
  if (secretName) {
    const html = fullDocument ? await page.content() : await page.locator("main").innerHTML();
    expect(html).not.toContain(secretName);
    const wishes = PEOPLE.find((p) => p.name === secretName)?.wishes;
    if (wishes) expect(html).not.toContain(wishes.split("\n")[0]);
  }
}

/** Pulsa "Mostrar", valida nombre + sugerencias del destinatario y devuelve su nombre. */
async function showFriend(page: Page): Promise<string> {
  await page.getByRole("button", { name: SHOW }).click();
  await expect(revealedCard(page)).toBeVisible({ timeout: 20_000 });
  const name = ((await revealedCard(page).locator("h2").textContent()) ?? "").replace(/🎁/g, "").trim();
  const person = PEOPLE.find((p) => p.name === name);
  expect(person, `destinatario desconocido: ${name}`).toBeTruthy();
  if (person!.wishes) {
    await expect(page.getByText("🎁 ¿Qué le gustaría recibir?")).toBeVisible();
    // innerText respeta los saltos de línea originales (white-space: pre-wrap).
    expect(await page.getByTestId("gift-wishes").innerText()).toBe(person!.wishes);
    // Los enlaces son clicables, seguros y se abren en otra pestaña.
    const url = person!.wishes.match(/https?:\/\/[^\s)]+[^\s).,]/)?.[0];
    if (url) {
      const link = page.getByTestId("gift-wishes").getByRole("link");
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute("href", url);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    }
    await expect(page.getByText("✨ Estas son algunas ideas. ¡También puedes sorprenderlo con algo diferente!")).toBeVisible();
  } else {
    await expect(page.getByText(NO_WISHES)).toBeVisible();
    await expect(page.getByTestId("gift-wishes")).toHaveCount(0);
  }
  expect(await revealedCard(page).innerText()).not.toMatch(/\b(null|undefined)\b|\[\]/);
  await expect(page.getByRole("button", { name: HIDE })).toBeVisible();
  return name;
}

async function reveal(page: Page, card: number): Promise<string> {
  await page.goto("/sorteo");
  await page.getByRole("button", { name: new RegExp(`^Tarjeta ${String(card).padStart(2, "0")}$`) }).click();
  // Todo lo que el servidor responda al reclamar la tarjeta (no debe incluir al destinatario).
  const bodies: Promise<string>[] = [];
  const onResponse = (r: Response) => {
    if (r.request().method() === "POST") bodies.push(r.text().catch(() => ""));
  };
  page.on("response", onResponse);
  await page.getByRole("button", { name: "Abrir esta tarjeta" }).click();
  await expect(page.getByRole("heading", { name: "🎉 ¡Ya tienes tu amigo secreto!" })).toBeVisible({ timeout: 20_000 });
  await expectHidden(page);
  page.off("response", onResponse);
  const claimTraffic = (await Promise.all(bodies)).join("\n");
  const htmlBefore = await page.content();

  const name = await showFriend(page);
  // Antes de pulsar "Mostrar" el navegador no tenía el nombre: ni en el HTML ni en la respuesta del reclamo.
  expect(htmlBefore).not.toContain(name);
  expect(claimTraffic).not.toContain(name);

  // Ocultar → vuelve a proteger todo; y se puede alternar cuantas veces se quiera.
  await page.getByRole("button", { name: HIDE }).click();
  await expectHidden(page, name);
  expect(await showFriend(page)).toBe(name);
  await page.getByRole("button", { name: HIDE }).click();
  await expectHidden(page, name);
  return name;
}

test("flujo completo: identificación, permisos, sorteo, concurrencia, entrega y celebración", async ({ browser }) => {
  test.setTimeout(300_000);

  // --- Identificación ------------------------------------------------------
  const org = await newPage(browser);
  await org.goto("/ingresar");
  await expect(org.getByRole("heading", { name: /Bienvenido a nuestro/ })).toBeVisible();
  await expect(org.getByText("Identifícate para descubrir la magia de esta Navidad")).toBeVisible();
  await org.screenshot({ path: `${SHOTS}/01-ingreso.png`, fullPage: true });

  // Número equivocado → mensaje claro.
  await org.getByRole("combobox").fill("pablo");
  await org.getByRole("option", { name: "Pablo Monroy" }).click();
  await org.getByLabel("Tu número identificador").fill("99");
  await org.getByRole("button", { name: "Ingresar" }).click();
  await expect(org.getByText("El número identificador no coincide con ese nombre.")).toBeVisible();

  await login(org, "Pablo Monroy", "00");
  await expect(org.getByRole("heading", { name: "Pablo Monroy" })).toBeVisible();
  // La sesión persiste entre navegaciones (no se vuelve a pedir nombre y número).
  await org.goto("/");
  await expect(org).toHaveURL(/\/inicio/);

  // Cookie de sesión HttpOnly y SameSite.
  const cookies = await org.context().cookies();
  const sessionCookie = cookies.find((c) => c.name.includes("santa_sesion"));
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe("Lax");

  // --- Permisos ------------------------------------------------------------
  const carlos = await newPage(browser);
  await login(carlos, "Carlos Martínez", "02");
  await carlos.goto("/admin");
  await expect(carlos).toHaveURL(/\/inicio\?motivo=sin-permiso/);
  expect((await carlos.request.get("/api/admin/exportar")).status()).toBe(403);
  expect((await carlos.request.get("/api/presentacion/estado")).status()).toBe(401);
  await expect(carlos.getByRole("link", { name: /Admin/ })).toHaveCount(0);

  // Sin sesión: no hay acceso a nada privado.
  const anon = await newPage(browser);
  expect((await anon.request.get("/api/sorteo/tarjetas")).status()).toBe(401);
  await anon.goto("/admin");
  await expect(anon).toHaveURL(/\/ingresar/);

  // --- Administración: iniciar sorteo ------------------------------------
  await org.goto("/admin");
  await expect(org.getByRole("heading", { name: "Resumen del evento" })).toBeVisible();
  await org.screenshot({ path: `${SHOTS}/02-admin-resumen.png`, fullPage: true });
  await org.goto("/admin/sorteo");
  await org.getByRole("button", { name: "Iniciar sorteo", exact: true }).click();
  await org.getByRole("button", { name: "Sí, iniciar sorteo" }).click();
  await expect(org.getByText("¡Sorteo iniciado!")).toBeVisible();

  // --- Concurrencia: dos personas abren la MISMA tarjeta a la vez ---------
  const camila = await newPage(browser);
  await login(camila, "Camila Gómez", "03");
  await carlos.goto("/sorteo");
  await camila.goto("/sorteo");
  await carlos.screenshot({ path: `${SHOTS}/03-tarjetas.png`, fullPage: true });
  for (const p of [carlos, camila]) await p.getByRole("button", { name: /^Tarjeta 05$/ }).click();
  await Promise.all([carlos, camila].map((p) => p.getByRole("button", { name: "Abrir esta tarjeta" }).click()));
  const winners: Page[] = [];
  const losers: Page[] = [];
  await Promise.all(
    [carlos, camila].map(async (p) => {
      const won = p.getByRole("heading", { name: "🎉 ¡Ya tienes tu amigo secreto!" });
      const lost = p.getByText("¡Alguien se adelantó!");
      await expect(won.or(lost)).toBeVisible({ timeout: 20_000 });
      ((await won.isVisible()) ? winners : losers).push(p);
    }),
  );
  expect(winners).toHaveLength(1);
  expect(losers).toHaveLength(1);
  await expectHidden(winners[0]);
  await winners[0].screenshot({ path: `${SHOTS}/04-resultado-oculto.png`, fullPage: true });
  // Quien perdió escoge otra tarjeta y puede continuar.
  const results = new Map<string, string>();
  results.set(winners[0] === carlos ? "Carlos Martínez" : "Camila Gómez", await showFriend(winners[0]));
  await winners[0].screenshot({ path: `${SHOTS}/04-resultado.png`, fullPage: true });
  results.set(losers[0] === carlos ? "Carlos Martínez" : "Camila Gómez", await reveal(losers[0], 6));

  // --- El resto revela ---------------------------------------------------
  let card = 1;
  for (const person of PEOPLE.filter((p) => !results.has(p.name))) {
    const page = person.name === "Pablo Monroy" ? org : await newPage(browser);
    if (page !== org) await login(page, person.name, person.id);
    results.set(person.name, await reveal(page, card++));
  }

  // Reglas matemáticas vistas desde la interfaz: nadie se tiene a sí mismo y nadie se repite.
  for (const [giver, receiver] of results) expect(receiver.toLowerCase()).not.toBe(giver.toLowerCase());
  expect(new Set([...results.values()].map((v) => v.toLowerCase())).size).toBe(PEOPLE.length);

  // Acceso posterior: mismo amigo secreto, sin tarjetas y OCULTO por defecto.
  const carlosFriend = results.get("Carlos Martínez")!;
  await carlos.goto("/inicio");
  await expect(carlos.getByRole("heading", { name: "🎁 ¿Olvidaste quién es tu amigo secreto?" })).toBeVisible();
  await expectHidden(carlos, carlosFriend, true);
  await carlos.screenshot({ path: `${SHOTS}/05-olvidaste-oculto.png`, fullPage: true });
  expect(await showFriend(carlos)).toBe(carlosFriend);
  await carlos.screenshot({ path: `${SHOTS}/05-olvidaste.png`, fullPage: true });
  // Recargar → vuelve a estar oculto.
  await carlos.reload();
  await expectHidden(carlos, carlosFriend, true);
  // Navegar a otra página y regresar → oculto.
  expect(await showFriend(carlos)).toBe(carlosFriend);
  await carlos.goto("/sorteo");
  await expect(carlos).toHaveURL(/\/inicio/);
  await expectHidden(carlos, carlosFriend, true);
  expect(await showFriend(carlos)).toBe(carlosFriend);
  await carlos.goBack();
  await carlos.goForward();
  await expectHidden(carlos, carlosFriend);

  // Un organizador corrige las sugerencias con el sorteo en curso → Carlos ve el texto nuevo al mostrar.
  const updatedWishes = "Ahora prefiere:\nun rompecabezas de 1000 piezas, ¡o algo de café!";
  await org.goto("/admin/participantes");
  await org.getByRole("listitem").filter({ hasText: carlosFriend }).getByRole("button", { name: "Editar" }).click();
  await org.getByLabel("🎁 Opciones de regalo").fill(updatedWishes);
  await org.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(org.getByText("Cambios guardados.")).toBeVisible();
  PEOPLE.find((p) => p.name === carlosFriend)!.wishes = updatedWishes;
  await carlos.reload();
  await expectHidden(carlos, carlosFriend, true);
  expect(await showFriend(carlos)).toBe(carlosFriend);

  // Cerrar sesión y volver a ingresar → mismo resultado, empieza OCULTO y sin repetir el sorteo.
  await carlos.locator("header form button[type=submit]").click();
  await expect(carlos).toHaveURL(/\/ingresar/);
  await login(carlos, "Carlos Martínez", "02");
  await expectHidden(carlos, carlosFriend);
  expect(await showFriend(carlos)).toBe(carlosFriend);
  await carlos.goto("/sorteo");
  await expect(carlos).toHaveURL(/\/inicio/);

  // --- Día de entrega -----------------------------------------------------
  await org.goto("/admin/entrega");
  await org.getByRole("button", { name: "🎉 Iniciar La Gran Revelación" }).click();
  await org.getByRole("button", { name: "¡Comenzar!" }).click();
  await expect(org.getByText("¡Comenzó La Gran Revelación!")).toBeVisible();
  await org.getByRole("button", { name: "Generar código para el TV" }).click();
  const code = (await org.locator("p.font-mono").first().innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  const tv = await newPage(browser, "tv");
  await tv.goto("/tv");
  await tv.getByLabel("Código de presentación").fill(code);
  await tv.getByRole("button", { name: "Conectar pantalla" }).click();
  await expect(tv).toHaveURL(/\/presentacion/);
  await expect(tv.getByRole("heading", { name: "🎉 LA GRAN REVELACIÓN 🎉" })).toBeVisible();
  await tv.screenshot({ path: `${SHOTS}/06-tv-inicio.png` });

  for (let turn = 0; turn < PEOPLE.length; turn++) {
    await org.getByRole("button", { name: "🎲 Elegir siguiente participante" }).click();
    await expect(org.getByText("🎁 Turno actual")).toBeVisible();
    const receiver = (await org.locator("h2.font-display").filter({ hasNotText: "Entregas" }).first().innerText()).trim();

    // El TV no recibe al regalador antes de la entrega.
    const tvState = await (await tv.request.get("/api/presentacion/estado")).json();
    expect(tvState.activeTurn.receiver.fullName).toBe(receiver);
    expect(Object.keys(tvState.activeTurn)).toEqual(["turnId", "startedAt", "receiver"]);
    const expectedGiver = [...results].find(([, r]) => r === receiver)![0];
    expect(JSON.stringify(tvState.pending)).not.toContain("giver");

    await expect(tv.getByText("🎁 ¡ES TU TURNO!").first()).toBeVisible({ timeout: 30_000 });
    if (turn === 0) {
      await tv.waitForTimeout(6500);
      await tv.screenshot({ path: `${SHOTS}/07-tv-turno.png` });
    }

    await org.getByRole("button", { name: "Validar quién debe entregar" }).click();
    await expect(org.getByText("Debe entregar")).toBeVisible();
    await expect(org.getByText(expectedGiver, { exact: true }).first()).toBeVisible();
    if (turn === 0) await org.screenshot({ path: `${SHOTS}/08-organizador-turno.png`, fullPage: true });
    await org.getByRole("button", { name: "Confirmar entrega" }).click();
    await expect(org.getByText("¡Entrega confirmada! 🎉").first()).toBeVisible();
    await expect(tv.getByText("🎉 ¡Regalo entregado! 🎉")).toBeVisible({ timeout: 30_000 });
    if (turn === 0) await tv.screenshot({ path: `${SHOTS}/09-tv-entregado.png` });
  }

  await org.getByRole("button", { name: "Finalizar evento" }).click();
  await org.getByRole("button", { name: "Finalizar 🎄" }).click();
  await expect(tv.getByRole("heading", { name: "🎄 ¡FELIZ NAVIDAD! 🎄" })).toBeVisible({ timeout: 45_000 });
  await tv.waitForTimeout(2500);
  await tv.screenshot({ path: `${SHOTS}/10-tv-final.png` });
});
