/**
 * A versão do app, mostrada na abertura: o instante do build e o commit, gravados pelo Vite
 * (`define` em vite.config.ts). Com o app instalado (PWA), o service worker serve a versão guardada e
 * baixa a nova em segundo plano: quando ela assume, a abertura oferece recarregar (`watchAppUpdate`).
 */
import { create } from 'zustand';

interface BuildInfo {
  /** Instante do build (ISO 8601, UTC). */
  readonly time: string;
  /** Os 7 primeiros caracteres do commit ("" sem git). */
  readonly commit: string;
  /** A página do commit no GitHub (só nos builds do GitHub Actions). */
  readonly commitUrl: string | null;
}

declare const __APP_BUILD__: BuildInfo;

export const APP_BUILD: BuildInfo = __APP_BUILD__;

/** "20/10/2026, 13:20": o instante do build no fuso de quem vê (ou em `timeZone`). */
export function formatBuildTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(new Date(iso));
}

/** Uma versão nova do app foi instalada pelo service worker e só falta recarregar para usá-la. */
export const useAppUpdate = create<{ readonly ready: boolean }>(() => ({ ready: false }));

/**
 * Avisa quando um service worker novo assume a página (o `autoUpdate` do vite-plugin-pwa: ele se instala,
 * pula a espera e assume as abas abertas, que continuam rodando o código antigo). Sem controlador na
 * carga, é a primeira instalação: a página já é a versão atual, e a troca de controlador não é novidade.
 */
export function watchAppUpdate(): void {
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!sw?.controller) return;
  sw.addEventListener('controllerchange', () => useAppUpdate.setState({ ready: true }), { once: true });
}
