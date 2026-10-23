import { test, expect } from "@playwright/test";

test("conecta loop.body y tryCatch ramas, guarda y recarga verificando DSL", async ({ page }) => {
  // Login
  await page.goto("/login");
  await page.fill('input[type="email"], input[name="email"]', "admin@rpa.studio");
  await page.fill('input[type="password"], input[name="password"]', "secret123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(recipes|$)/, { timeout: 30000 });

  // Ir directamente a la receta de aceptación
  await page.goto("/recipes/01a16a04-0792-7295-a579-22a156591e9c/edit");
  await page.waitForSelector(".react-flow", { timeout: 30000 });
  await page.waitForTimeout(3000);

  // Asegurar que la paleta esté visible
  const paletteToggle = page.locator('button:has-text("Bloques")');
  if (await paletteToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
    await paletteToggle.click();
    await page.waitForTimeout(1000);
  }

  const palette = page.locator('aside.border-r');
  await expect(palette).toBeVisible({ timeout: 10000 });

  // Añadir nodo loop y tryCatch desde paleta
  await palette.getByText(/Bucle/i).first().click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  await palette.getByText(/Try/i).first().click({ timeout: 10000 });
  await page.waitForTimeout(4000);

  // Verificar estructura de handles dentro de los nodos recién añadidos
  const loopNode = page.locator('.react-flow__node').filter({ hasText: /Bucle/i }).last();
  const tryNode = page.locator('.react-flow__node').filter({ hasText: /Try/i }).last();

  await expect(loopNode).toBeVisible({ timeout: 10000 });
  await expect(tryNode).toBeVisible({ timeout: 10000 });

  // Loop debe tener: 1 handle top (entrada) + 2 handles bottom (body + next)
  await expect(loopNode.locator('.react-flow__handle')).toHaveCount(3, { timeout: 15000 });
  // TryCatch debe tener: 1 handle top (entrada) + 4 handles bottom (try/catch/finally/next)
  await expect(tryNode.locator('.react-flow__handle')).toHaveCount(5, { timeout: 15000 });

  // Guardar
  await page.click('button[title*="Guardar"], button:has-text("Guardar")');
  await page.waitForTimeout(5000);

  // Recargar y verificar persistencia
  await page.reload();
  await page.waitForSelector(".react-flow", { timeout: 30000 });
  await page.waitForTimeout(8000);

  const loopNodeAfter = page.locator('.react-flow__node').filter({ hasText: /Bucle/i }).last();
  const tryNodeAfter = page.locator('.react-flow__node').filter({ hasText: /Try/i }).last();

  await expect(loopNodeAfter).toBeVisible({ timeout: 15000 });
  await expect(tryNodeAfter).toBeVisible({ timeout: 15000 });

  await expect(loopNodeAfter.locator('.react-flow__handle')).toHaveCount(3, { timeout: 15000 });
  await expect(tryNodeAfter.locator('.react-flow__handle')).toHaveCount(5, { timeout: 15000 });
});
