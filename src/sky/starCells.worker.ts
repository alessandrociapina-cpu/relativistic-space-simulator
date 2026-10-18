/**
 * Monta a grade de estrelas do catálogo fora da thread principal (~20 ms por
 * montagem): a paralaxe muda as donas das células ao longo da viagem.
 */
import catalog from './data/bright-stars.json';
import type { Mat3 } from './skyFrame';
import type { StarBuildMessage, StarBuildResult, StarSetupMessage } from './skyMapMessages';
import { buildStarCells, parseCatalog, type CatalogStar } from './starCells';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<StarSetupMessage | StarBuildMessage>) => void) | null;
  postMessage(message: StarBuildResult, transfer: Transferable[]): void;
};

let destinationId = '';
let stars: CatalogStar[] = [];

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'setup') {
    destinationId = message.destinationId;
    stars = parseCatalog(catalog.stars, message.icrsToShip as unknown as Mat3, message.targetDistanceLy, message.origin);
    return;
  }
  if (message.destinationId !== destinationId) return;
  const build = buildStarCells(stars, message.shipDistanceLy);
  scope.postMessage({ destinationId, ...build }, [build.data.buffer]);
};
