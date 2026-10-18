import type { Vec3 } from './skyFrame';

/** Pedido de um mapa do céu difuso visto de `origin` (heliocêntrico, kpc). */
export interface SkyMapRequest {
  readonly key: string;
  readonly origin: Vec3;
  readonly width: number;
  readonly height: number;
}

export interface SkyMapResult extends SkyMapRequest {
  /** Por texel: log₁₀ do brilho de exibição e fração do bojo. */
  readonly data: Float32Array;
}

/** Prepara o catálogo no referencial da nave para uma viagem (partida e destino, em `destinationId`). */
export interface StarSetupMessage {
  readonly type: 'setup';
  readonly destinationId: string;
  readonly icrsToShip: readonly (readonly [number, number, number])[];
  /** Distância do alvo (anos-luz): uma estrela do catálogo nessa posição é o próprio alvo e sai. */
  readonly targetDistanceLy: number;
  /** Partida fora do Sol: a estrela de partida sai do catálogo e o Sol entra (null: partida do Sol). */
  readonly origin: { readonly positionLy: Vec3; readonly sunLuminosity: number } | null;
}

/** Monta a grade de estrelas para a nave a `shipDistanceLy` da estrela de partida. */
export interface StarBuildMessage {
  readonly type: 'build';
  readonly destinationId: string;
  readonly shipDistanceLy: number;
}

export interface StarBuildResult {
  readonly destinationId: string;
  readonly shipDistanceLy: number;
  readonly nearestLy: number;
  readonly starCount: number;
  readonly data: Float32Array;
}
