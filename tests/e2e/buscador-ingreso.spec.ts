import { expect, test } from "@playwright/test";

const ALL = ["Ana María Díaz", "Camila Gómez", "Carlos Martínez", "José Pérez", "Laura Rodríguez", "Pablo Monroy"];

test("buscador de nombres del ingreso: filtra, se navega con teclado y exige escoger de la lista", async ({ page }) => {
  await page.goto("/ingresar");
  const combo = page.getByRole("combobox");
  const list = page.getByRole("listbox");
  const options = page.getByRole("option");

  // Vacío → todos.
  await combo.tap();
  await expect(list).toBeVisible();
  await expect(options).toHaveText(ALL);

  // Nombre, apellido, sin tildes, mayúsculas y varios términos no consecutivos.
  await combo.fill("carlos");
  await expect(options).toHaveText(["Carlos Martínez"]);
  await combo.fill("rodriguez");
  await expect(options).toHaveText(["Laura Rodríguez"]);
  await combo.fill("perez");
  await expect(options).toHaveText(["José Pérez"]);
  await combo.fill("JOSÉ");
  await expect(options).toHaveText(["José Pérez"]);
  await combo.fill("  ana   diaz ");
  await expect(options).toHaveText(["Ana María Díaz"]);

  // Sin coincidencias.
  await combo.fill("zacarías");
  await expect(options).toHaveCount(0);
  await expect(list).toContainText("No encontramos participantes con ese nombre");

  // Borrar → todos otra vez.
  await combo.fill("");
  await expect(options).toHaveText(ALL);

  // El texto escrito no es una selección: aunque coincida exactamente, hay que escoger de la lista.
  await combo.fill("Carlos Martínez");
  await page.getByLabel("Tu número identificador").fill("02");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByText("Escoge tu nombre de la lista.")).toBeVisible();
  await expect(page).toHaveURL(/\/ingresar/);

  // Teclado: flechas + Enter escogen y cierran; Escape cierra.
  await combo.fill("ca");
  await expect(options).toHaveText(["Camila Gómez", "Carlos Martínez"]);
  await combo.press("ArrowDown");
  await combo.press("Enter");
  await expect(combo).toHaveValue("Carlos Martínez");
  await expect(list).toBeHidden();
  await combo.press("ArrowDown");
  await expect(list).toBeVisible();
  await expect(page.getByRole("option", { name: "Carlos Martínez" })).toHaveAttribute("aria-selected", "true");
  await combo.press("Escape");
  await expect(list).toBeHidden();

  // Editar el texto después de escoger invalida la selección.
  await combo.press("Backspace");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByText("Escoge tu nombre de la lista.")).toBeVisible();

  // El listado cabe en la pantalla del celular.
  await combo.fill("");
  await combo.tap();
  const box = await list.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

  // Escoger tocando y continuar con la identificación.
  await combo.fill("laura");
  await page.getByRole("option", { name: "Laura Rodríguez" }).tap();
  await expect(combo).toHaveValue("Laura Rodríguez");
  await expect(list).toBeHidden();
  await page.getByLabel("Tu número identificador").fill("01");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/inicio/);
});
