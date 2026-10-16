/**
 * Calcula os mapas do brilho difuso da Via Láctea fora da thread principal:
 * cada um leva de 1 a 2 s de integração ao longo dos raios.
 */
import { buildSkyMap } from './galaxyModel';
import type { SkyMapRequest, SkyMapResult } from './skyMapMessages';

// O projeto compila com a lib DOM; no worker, só isto de `self` é usado.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SkyMapRequest>) => void) | null;
  postMessage(message: SkyMapResult, transfer: Transferable[]): void;
};

scope.onmessage = (event) => {
  const request = event.data;
  const data = buildSkyMap(request.origin, request.width, request.height);
  scope.postMessage({ ...request, data }, [data.buffer]);
};
