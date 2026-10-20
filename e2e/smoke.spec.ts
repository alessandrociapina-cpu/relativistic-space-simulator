import { expect, test, type Page } from '@playwright/test';

/** Erros de página e do console durante o teste (o aviso do THREE.Clock, filtrado no app, também falharia). */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && m.text().startsWith('THREE.'))) errors.push(`${m.type()}: ${m.text()}`);
  });
  return errors;
}

test('abertura: as duas viagens e a ficção científica hard', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Simulador Relativístico' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Seções do app' });
  await expect(nav.getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: /Quase à velocidade da luz/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Sondas históricas/ })).toBeVisible();
  // A versão (instante do build e commit), para conferir se uma atualização chegou.
  await expect(page.getByText(/Versão de \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/)).toBeVisible();
  await page.getByRole('link', { name: /Ficção científica hard/ }).click();
  // O cockpit carrega sob demanda: no primeiro acesso, com o servidor frio, passa dos 5 s padrão.
  await expect(page.getByRole('tab', { name: /Ficção científica hard/ })).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
  await expect(page.getByRole('article', { name: 'Hail Mary (Project Hail Mary)' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Ficção' })).toHaveAttribute('aria-current', 'page');
  // A barra de navegação troca a aba do planejamento sem sair do cockpit.
  await nav.getByRole('link', { name: 'Viagem' }).click();
  await expect(page.getByRole('tab', { name: /Planejar/ })).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('viagem: o link de uma missão abre o planejamento, embarca e o relógio de bordo anda', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#viagem?f=hail-mary');
  const planner = page.getByRole('dialog', { name: 'Planejamento da missão' });
  await expect(planner).toBeVisible();
  await expect(planner.getByText(/Hail Mary/).first()).toBeVisible();
  await expect(planner.getByRole('radio', { name: /Tau Ceti/ })).toHaveAttribute('aria-checked', 'true');
  await planner.getByRole('button', { name: 'Embarcar ›' }).first().click();
  await expect(planner).toBeHidden();
  await expect(page).toHaveURL(/#viagem\?d=tauCeti/);
  const hud = page.getByRole('region', { name: 'Telemetria' });
  await expect(hud).toContainText('Tau Ceti', { ignoreCase: true });
  await expect(page.locator('canvas').first()).toBeVisible();
  // Partida pelo teclado: 3 s de contagem e o voo.
  await page.keyboard.press('Space');
  await expect(hud).not.toContainText('Pronta para partir', { ignoreCase: true, timeout: 20_000 });
  await expect(hud).toContainText('Acelerando', { ignoreCase: true });
  expect(errors).toEqual([]);
});

test('sondas: o Sistema Solar abre com os eventos e as fórmulas', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#sondas');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  const events = page.getByRole('navigation', { name: 'Eventos da missão' });
  await expect(events).toBeVisible();
  await events.getByRole('button').nth(1).click();
  await expect(page.locator('.katex').first()).toBeVisible();
  await page.getByRole('navigation', { name: 'Seções do app' }).getByRole('link', { name: 'Início' }).click();
  await expect(page.getByRole('heading', { name: 'Simulador Relativístico' })).toBeVisible();
  expect(errors).toEqual([]);
});
