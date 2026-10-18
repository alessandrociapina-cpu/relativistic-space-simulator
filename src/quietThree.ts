import { setConsoleFunction } from 'three';

/**
 * O @react-three/fiber 8 (o último para React 18) cria um `THREE.Clock` em cada `<Canvas>`, e o three
 * r183+ avisa a cada um que o Clock foi substituído pelo Timer. O aviso não depende do app: só ele é
 * filtrado, e os demais avisos e erros do three seguem para o console. Importado antes de cada `<Canvas>`.
 */
const CLOCK_DEPRECATION = 'THREE.Clock: This module has been deprecated';

setConsoleFunction((type: 'log' | 'warn' | 'error', message: string, ...params: unknown[]) => {
  if (type === 'warn' && message.startsWith(CLOCK_DEPRECATION)) return;
  console[type](message, ...params);
});
