/**
 * Ponto de entrada das reconstruções (usado só por `scripts/reconstruct.mjs`,
 * fora do app): devolve os JSON a gravar em src/probes/data, por nome de arquivo.
 */
import { APOLLO_SPECS, apollo } from './apollo';
import { magellan, mariner10, viking, type ReconstructedData } from './interplanetary';

export const TARGETS = ['mariner10', 'viking1', 'viking2', 'magellan', ...APOLLO_SPECS.map((s) => s.id)] as const;

export function build(target: string): Record<string, ReconstructedData> {
  switch (target) {
    case 'mariner10':
      return { mariner10: mariner10() };
    case 'viking1':
    case 'viking2': {
      const { orbiter, lander } = viking(target);
      return { [target]: orbiter, [`${target}-lander`]: lander };
    }
    case 'magellan':
      return { magellan: magellan() };
    default: {
      const spec = APOLLO_SPECS.find((s) => s.id === target);
      if (!spec) throw new Error(`Reconstrução desconhecida: ${target}`);
      const { csm, lm } = apollo(spec);
      return lm ? { [target]: csm, [`${target}-lm`]: lm } : { [target]: csm };
    }
  }
}
