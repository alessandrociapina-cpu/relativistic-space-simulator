import { useEffect, useState } from 'react';

/** As duas partes do app: o cockpit relativístico e o simulador de sondas. */
export type AppMode = 'relativistic' | 'probes';

/** `#sondas` abre o simulador de sondas; o resto (`#viagem` ou nada), o cockpit. */
const readMode = (): AppMode => (window.location.hash === '#sondas' ? 'probes' : 'relativistic');

/** Modo atual pela âncora da URL: os links trocam de modo e o botão voltar do navegador também. */
export function useAppMode(): AppMode {
  const [mode, setMode] = useState(readMode);
  useEffect(() => {
    const onHash = () => setMode(readMode());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return mode;
}
