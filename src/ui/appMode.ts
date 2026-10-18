import { useEffect, useState } from 'react';

/** As telas do app: a abertura, o cockpit relativístico e o simulador de sondas. */
export type AppMode = 'home' | 'relativistic' | 'probes';

/** Âncora de cada tela: os links trocam de tela e o botão voltar do navegador também. */
export const APP_HASH: Readonly<Record<AppMode, string>> = { home: '#inicio', relativistic: '#viagem', probes: '#sondas' };

/** `#viagem?aba=ficcao` abre o planejamento no menu da ficção científica hard (a missão no endereço: `missionLink`). */
export const SCIFI_TAB_PARAM = 'ficcao';
export const SCIFI_TAB_HASH = `${APP_HASH.relativistic}?aba=${SCIFI_TAB_PARAM}`;

/** `#sondas` abre as sondas, `#viagem` (ou `#viagem?…`, com uma missão) o cockpit; o resto (nada, `#inicio`), a abertura. */
const readMode = (): AppMode => {
  const { hash } = window.location;
  if (hash === APP_HASH.probes) return 'probes';
  return hash === APP_HASH.relativistic || hash.startsWith(`${APP_HASH.relativistic}?`) ? 'relativistic' : 'home';
};

/** Tela atual pela âncora da URL. */
export function useAppMode(): AppMode {
  const [mode, setMode] = useState(readMode);
  useEffect(() => {
    const onHash = () => setMode(readMode());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return mode;
}
