/**
 * Texturas e uniforms do céu real, compartilhados pelos monitores: a tabela do
 * sensor, a grade de estrelas do catálogo e os mapas da Via Láctea. O trabalho
 * pesado roda em dois workers (grade de estrelas e mapas difusos); enquanto um
 * resultado não chega, o shader usa o anterior.
 */
import * as THREE from 'three';
import { LIGHT_YEAR_M, type FlightState } from '../physics/RelativityEngine';
import type { Destination } from '../physics/destinations';
import { ORIGINS, originDistanceLy, originLuminosity, originPositionLy, type Origin } from '../physics/origins';
import { SENSOR_LUT, buildSensorLut } from '../physics/sensorResponse';
import { targetViewDistanceM } from '../physics/sky';
import { SKY_MAP_SIZE, relativeStarDensity, shipPositionKpc, skyMapKeyframes } from './galaxyModel';
import { skyFrameFor, type SkyFrame } from './skyFrame';
import type { SkyMapRequest, SkyMapResult, StarBuildMessage, StarBuildResult, StarSetupMessage } from './skyMapMessages';
import { STAR_CELLS_N, displayAmplitude, needsRebuild } from './starCells';

// ── Tabela do sensor ─────────────────────────────────────────────────────────
function floatTexture(data: Float32Array, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export const sensorLutTexture = floatTexture(buildSensorLut(), SENSOR_LUT.size, 1);

// ── Grade de estrelas ────────────────────────────────────────────────────────
const starCellsTexture = floatTexture(new Float32Array(STAR_CELLS_N * 6 * STAR_CELLS_N * 4), STAR_CELLS_N, 6 * STAR_CELLS_N);
/** Intervalo mínimo entre montagens da grade (ms). */
const STAR_REBUILD_MS = 150;

interface StarState {
  destinationId: string;
  built: StarBuildResult | null;
  pending: boolean;
  lastRequest: number;
}

let starWorker: Worker | null = null;
const stars: StarState = { destinationId: '', built: null, pending: false, lastRequest: 0 };
/** Muda a cada resultado de um worker: invalida os uniforms guardados do instante. */
let resultsVersion = 0;

function getStarWorker(): Worker {
  if (!starWorker) {
    starWorker = new Worker(new URL('./starCells.worker.ts', import.meta.url), { type: 'module' });
    starWorker.onmessage = (event: MessageEvent<StarBuildResult>) => {
      stars.pending = false;
      if (event.data.destinationId !== stars.destinationId) return;
      stars.built = event.data;
      (starCellsTexture.image.data as Float32Array).set(event.data.data);
      starCellsTexture.needsUpdate = true;
      resultsVersion++;
    };
  }
  return starWorker;
}

/** A viagem: partida e destino (o mesmo destino visto de outra estrela é outro céu). */
const tripKey = (origin: Origin, destination: Destination) => `${origin.id}>${destination.id}`;

/** Luminosidade do Sol na unidade do catálogo, para o Sol como estrela do céu numa partida de outra estrela. */
const SUN_LUMINOSITY = originLuminosity(ORIGINS.sol);

function updateStars(destination: Destination, origin: Origin, frame: SkyFrame, shipLy: number) {
  const worker = getStarWorker();
  const trip = tripKey(origin, destination);
  if (stars.destinationId !== trip) {
    stars.destinationId = trip;
    stars.built = null;
    stars.pending = false;
    (starCellsTexture.image.data as Float32Array).fill(0);
    starCellsTexture.needsUpdate = true;
    const setup: StarSetupMessage = {
      type: 'setup',
      destinationId: trip,
      icrsToShip: frame.icrsToShip,
      targetDistanceLy: destination.kind === 'star' ? destination.distanceLy : Infinity,
      origin: origin.destinationId ? { positionLy: originPositionLy(origin), sunLuminosity: SUN_LUMINOSITY } : null,
    };
    worker.postMessage(setup);
  }
  const now = performance.now();
  const stale = stars.built === null || needsRebuild(stars.built, shipLy);
  if (stale && !stars.pending && now - stars.lastRequest > STAR_REBUILD_MS) {
    stars.pending = true;
    stars.lastRequest = now;
    const build: StarBuildMessage = { type: 'build', destinationId: trip, shipDistanceLy: shipLy };
    worker.postMessage(build);
  }
}

// ── Mapas da Via Láctea ──────────────────────────────────────────────────────
const EARTH_KEY = 'terra';
/** Mapas fora da Terra são menores: só servem às viagens ao centro galáctico e a Andrômeda. */
const KEYFRAME_SIZE = { width: 192, height: 96 } as const;

function halfFloatMap(result: SkyMapResult): THREE.DataTexture {
  const half = new Uint16Array(result.data.length);
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(result.data[i]!);
  const texture = new THREE.DataTexture(half, result.width, result.height, THREE.RGFormat, THREE.HalfFloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** Céu difuso apagado (log₁₀ ε = −9) enquanto nenhum mapa ficou pronto. */
const darkMap = (() => {
  const texture = new THREE.DataTexture(
    new Uint16Array([THREE.DataUtils.toHalfFloat(-9), 0]),
    1,
    1,
    THREE.RGFormat,
    THREE.HalfFloatType,
  );
  texture.needsUpdate = true;
  return texture;
})();

const mapTextures = new Map<string, THREE.DataTexture>();
let mapWorker: Worker | null = null;
let mapPending = false;
let mapDemand: { keys: string[]; origins: Map<string, SkyMapRequest> } = { keys: [], origins: new Map() };

// A Via Láctea vista da partida é a da Terra: 16 anos-luz (Erid) não mudam o céu difuso, que varia
// na escala de centenas de anos-luz.
const keyframeKey = (trip: string, distanceLy: number) => (distanceLy === 0 ? EARTH_KEY : `${trip}:${distanceLy}`);

function requestNextMap() {
  if (mapPending) return;
  const next = mapDemand.keys.find((k) => !mapTextures.has(k));
  if (!next) return;
  if (!mapWorker) {
    mapWorker = new Worker(new URL('./milkyWay.worker.ts', import.meta.url), { type: 'module' });
    mapWorker.onmessage = (event: MessageEvent<SkyMapResult>) => {
      mapPending = false;
      mapTextures.set(event.data.key, halfFloatMap(event.data));
      resultsVersion++;
      requestNextMap();
    };
  }
  mapPending = true;
  mapWorker.postMessage(mapDemand.origins.get(next)!);
}

/** Ordena os mapas pela utilidade: o da Terra primeiro, depois os mais próximos da nave. */
function demandMaps(trip: string, frame: SkyFrame, keyframes: readonly number[], shipLy: number) {
  const origins = new Map<string, SkyMapRequest>();
  for (const d of keyframes) {
    const key = keyframeKey(trip, d);
    const size = d === 0 ? SKY_MAP_SIZE : KEYFRAME_SIZE;
    origins.set(key, { key, origin: shipPositionKpc(frame.targetGalactic, d), ...size });
  }
  const keys = [...keyframes]
    .sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : Math.abs(a - shipLy) - Math.abs(b - shipLy)))
    .map((d) => keyframeKey(trip, d));
  mapDemand = { keys, origins };
  requestNextMap();
}

// ── Uniforms do instante ─────────────────────────────────────────────────────
export interface SkyUniforms {
  readonly starCells: THREE.DataTexture;
  /** Nave agora menos nave na montagem da grade (anos-luz, referencial da nave). */
  readonly shipOffset: readonly [number, number, number];
  readonly starGain: number;
  readonly milkyWayA: THREE.Texture;
  readonly milkyWayB: THREE.Texture;
  readonly milkyWayMix: number;
  readonly shipToGalactic: THREE.Matrix3;
  /** Densidade de estrelas na posição da nave, relativa à vizinhança solar. */
  readonly starDensity: number;
  /** Brilho de exibição do alvo e da estrela de partida como estrelas pontuais (antes de virarem disco). */
  readonly targetPointAmp: number;
  readonly sunPointAmp: number;
  /** Temperatura da estrela de partida (o Sol, ou 40 Eridani A). */
  readonly sunTempK: number;
}

interface DestinationSky {
  readonly id: string;
  readonly frame: SkyFrame;
  readonly keyframes: readonly number[];
  readonly shipToGalactic: THREE.Matrix3;
}

let current: DestinationSky | null = null;
let lastKey = '';
let lastUniforms: SkyUniforms | null = null;
let lastDemandAt = -Infinity;

function destinationSky(destination: Destination, trip: string): DestinationSky {
  if (current?.id !== trip) {
    const frame = skyFrameFor(destination);
    const m = frame.shipToGalactic;
    current = {
      id: trip,
      frame,
      keyframes: skyMapKeyframes(frame.targetGalactic, destination.distanceLy),
      shipToGalactic: new THREE.Matrix3().set(m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]),
    };
    lastDemandAt = -Infinity;
  }
  return current;
}

/** Os dois mapas prontos que cercam a posição da nave, e a mistura entre eles. */
function milkyWayPair(sky: DestinationSky, shipLy: number) {
  let below: { d: number; tex: THREE.DataTexture } | null = null;
  let above: { d: number; tex: THREE.DataTexture } | null = null;
  for (const d of sky.keyframes) {
    const tex = mapTextures.get(keyframeKey(sky.id, d));
    if (!tex) continue;
    if (d <= shipLy && (!below || d > below.d)) below = { d, tex };
    if (d >= shipLy && (!above || d < above.d)) above = { d, tex };
  }
  const a = below ?? above;
  const b = above ?? below;
  if (!a || !b) return { milkyWayA: darkMap, milkyWayB: darkMap, milkyWayMix: 0 };
  return { milkyWayA: a.tex, milkyWayB: b.tex, milkyWayMix: b.d > a.d ? (shipLy - a.d) / (b.d - a.d) : 0 };
}

/**
 * Uniforms do céu real para o instante do voo (uma vez por instante, para todos os monitores). `destination`
 * é o alvo visto da partida (`missionDestination`).
 */
export function skyUniforms(flight: FlightState, destination: Destination, origin: Origin = ORIGINS.sol): SkyUniforms {
  const trip = tripKey(origin, destination);
  const key = `${trip}:${flight.positionM}:${resultsVersion}`;
  if (key === lastKey && lastUniforms) return lastUniforms;
  const sky = destinationSky(destination, trip);
  const shipLy = flight.positionM / LIGHT_YEAR_M;

  updateStars(destination, origin, sky.frame, shipLy);
  // Reordena os mapas pedidos de vez em quando, conforme a nave anda (ou o scrub salta).
  const now = performance.now();
  if (now - lastDemandAt > 1000) {
    lastDemandAt = now;
    demandMaps(trip, sky.frame, sky.keyframes, shipLy);
  }

  const built = stars.built;
  const targetLy = targetViewDistanceM(flight, destination) / LIGHT_YEAR_M;
  const targetLuminosity =
    destination.visualMag === undefined ? 0 : 10 ** (-0.4 * destination.visualMag) * destination.distanceLy ** 2;
  lastKey = key;
  lastUniforms = {
    starCells: starCellsTexture,
    shipOffset: [0, 0, built ? -(shipLy - built.shipDistanceLy) : 0],
    starGain: built ? 1 : 0,
    ...milkyWayPair(sky, shipLy),
    shipToGalactic: sky.shipToGalactic,
    starDensity: relativeStarDensity(shipPositionKpc(sky.frame.targetGalactic, shipLy)),
    targetPointAmp: targetLuminosity > 0 ? displayAmplitude(targetLuminosity, targetLy) : 0,
    sunPointAmp: displayAmplitude(originLuminosity(origin), originDistanceLy(origin, flight.positionM)),
    sunTempK: origin.starTempK,
  };
  return lastUniforms;
}
