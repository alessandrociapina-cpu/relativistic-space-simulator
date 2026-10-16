/**
 * Modelo 3D simples da Via Láctea para o brilho difuso do céu, visto de
 * qualquer ponto da viagem: disco exponencial com quatro braços espirais,
 * disco espesso, barra e bojo, aglomerado estelar nuclear em torno de Sgr A*
 * e poeira com nuvens. O brilho de cada direção é a emissividade estelar
 * integrada ao longo do raio, atenuada pela poeira já atravessada.
 *
 * Coordenadas: galácticas heliocêntricas em kpc (x para l = 0, y para l = 90°,
 * z para o norte). Emissividade em unidades da vizinhança solar (≈ 1 no Sol).
 */
import { DESTINATIONS } from '../physics/destinations';
import { ICRS_TO_GALACTIC, apply, equatorialUnit, length, scale, sub, type Vec3 } from './skyFrame';

export const KPC_LY = 3261.563777;
/** Distância de Sgr A*, a mesma do destino (26 700 anos-luz ≈ 8,19 kpc). */
const GC_DISTANCE_KPC = DESTINATIONS.sgrA.distanceLy / KPC_LY;
/** Centro da galáxia: a posição de Sgr A*, para a viagem terminar exatamente nele. */
export const GALACTIC_CENTER: Vec3 = scale(
  apply(ICRS_TO_GALACTIC, equatorialUnit(DESTINATIONS.sgrA.raDeg, DESTINATIONS.sgrA.decDeg)),
  GC_DISTANCE_KPC,
);

const DISK = { scaleR: 2.6, scaleZ: 0.3, holeR: 3 } as const;
const THICK = { weight: 0.12, scaleR: 3.6, scaleZ: 0.9 } as const;
/** Barra: semi-eixos (kpc) e ângulo com a linha Sol–centro (a ponta perto do Sol fica em l > 0). */
const BAR = { weight: 600, a: 1.5, b: 0.55, c: 0.4, angle: (-27 * Math.PI) / 180 } as const;
/** Aglomerado nuclear: ~10⁶ L☉/pc³ a 1 pc, contra ~0,05 L☉/pc³ na vizinhança solar; some além de ~20 pc. */
const NUCLEAR = { weight: 2.8e7, core: 0.0015, edge: 0.02 } as const;
/** Quatro braços logarítmicos de 12,5°, um passando 1,3 kpc por dentro do Sol (Sagitário). */
const ARMS = { count: 4, pitch: (12.5 * Math.PI) / 180, width: 0.4, insideR: 6.9 } as const;
/** Poeira: A_V ≈ 1 mag/kpc no plano perto do Sol, escala de altura ~110 pc. */
const DUST = { kappa: 0.92, scaleR: 3.2, scaleZ: 0.11, cloud: 0.12, bubble: 0.08 } as const;

const R_SUN = Math.hypot(GALACTIC_CENTER[0], GALACTIC_CENTER[1]);
const SUN_PHI = Math.atan2(-GALACTIC_CENTER[1], -GALACTIC_CENTER[0]);
const ARM_PHASE = SUN_PHI - Math.log(ARMS.insideR) / Math.tan(ARMS.pitch);
const ARM_STEP = (2 * Math.PI) / ARMS.count;

// ── Ruído 3D (nuvens de poeira) ──────────────────────────────────────────────
function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}

// ── Emissividade e poeira ────────────────────────────────────────────────────
/** Quanto um ponto está perto de um braço (0 a 1). */
function armProximity(r: number, phi: number): number {
  const spiral = ARM_PHASE + Math.log(Math.max(r, 0.5)) / Math.tan(ARMS.pitch);
  let delta = (phi - spiral) % ARM_STEP;
  if (delta < 0) delta += ARM_STEP;
  if (delta > ARM_STEP / 2) delta -= ARM_STEP;
  const d = (delta * r) / ARMS.width;
  return Math.exp(-d * d);
}

interface Emissivity {
  /** Disco jovem e espesso (luz mais branca). */
  disk: number;
  /** Barra, bojo e aglomerado nuclear (estrelas velhas, avermelhadas). */
  bulge: number;
}

function rawEmissivity(qx: number, qy: number, qz: number): Emissivity {
  const r = Math.hypot(qx, qy);
  const z = Math.abs(qz);
  const hole = 0.3 + 0.7 * (1 - Math.exp(-((r / DISK.holeR) ** 3)));
  const thin = Math.exp(-(r - R_SUN) / DISK.scaleR - z / DISK.scaleZ) * hole * (0.45 + 1.1 * armProximity(r, Math.atan2(qy, qx)));
  const thick = THICK.weight * Math.exp(-(r - R_SUN) / THICK.scaleR - z / THICK.scaleZ);
  const cb = Math.cos(BAR.angle);
  const sb = Math.sin(BAR.angle);
  const xb = (cb * qx + sb * qy) / BAR.a;
  const yb = (-sb * qx + cb * qy) / BAR.b;
  const bar = BAR.weight * Math.exp(-(xb * xb + yb * yb + (qz / BAR.c) ** 2));
  const r3 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  const nuclear = r3 < 10 * NUCLEAR.edge ? (NUCLEAR.weight * Math.exp(-r3 / NUCLEAR.edge)) / (1 + (r3 / NUCLEAR.core) ** 2) ** 0.9 : 0;
  return { disk: thin + thick, bulge: bar + nuclear };
}

const SUN_EMISSIVITY = (() => {
  const e = rawEmissivity(-GALACTIC_CENTER[0], -GALACTIC_CENTER[1], -GALACTIC_CENTER[2]);
  return e.disk + e.bulge;
})();

/** Densidade de estrelas num ponto (heliocêntrico, kpc), relativa à vizinhança solar. */
export function relativeStarDensity(p: Vec3): number {
  const e = rawEmissivity(p[0] - GALACTIC_CENTER[0], p[1] - GALACTIC_CENTER[1], p[2] - GALACTIC_CENTER[2]);
  return (e.disk + e.bulge) / SUN_EMISSIVITY;
}

function dustOpacity(qx: number, qy: number, qz: number, distFromSun: number): number {
  const r = Math.hypot(qx, qy);
  const smoothDust = DUST.kappa * Math.exp(-(r - R_SUN) / DUST.scaleR - Math.abs(qz) / DUST.scaleZ);
  if (smoothDust < 1e-4) return 0;
  const n = 0.65 * valueNoise(qx / DUST.cloud, qy / DUST.cloud, qz / DUST.cloud) + 0.35 * valueNoise(qx / 0.05, qy / 0.05, qz / 0.05);
  const clouds = 0.1 + 2.2 * n * n * n;
  // A Bolha Local: o Sol está numa cavidade de ~100 pc quase sem poeira.
  const bubble = Math.min(1, Math.max(0.1, (distFromSun - DUST.bubble) / DUST.bubble));
  return smoothDust * clouds * bubble;
}

// ── Integração ao longo de um raio ───────────────────────────────────────────
/** Esfera em torno do centro que contém toda a luz do modelo (kpc). */
const GALAXY_RADIUS = 25;
const MARCH = { steps: 96, near: 0.0005 } as const;
/** Fora da galáxia, o passo acompanha a distância ao plano (o disco tem ~300 pc de espessura). */
const OUTSIDE_STEP = { min: 0.01, max: 0.8, perHeight: 0.25, maxSteps: 400 } as const;

export interface Glow {
  /** Brilho superficial (emissividade solar × kpc). */
  readonly intensity: number;
  /** Fração vinda do bojo, da barra e do núcleo (0 a 1): define a cor. */
  readonly bulgeFraction: number;
}

/** Brilho difuso visto de `origin` (heliocêntrico, kpc) na direção unitária `dir` (galáctica). */
export function marchGlow(origin: Vec3, dir: Vec3): Glow {
  const ox = origin[0] - GALACTIC_CENTER[0];
  const oy = origin[1] - GALACTIC_CENTER[1];
  const oz = origin[2] - GALACTIC_CENTER[2];
  // Trecho do raio dentro da esfera da galáxia.
  const b = ox * dir[0] + oy * dir[1] + oz * dir[2];
  const c = ox * ox + oy * oy + oz * oz - GALAXY_RADIUS * GALAXY_RADIUS;
  const disc = b * b - c;
  if (disc <= 0) return { intensity: 0, bulgeFraction: 0 };
  const exit = -b + Math.sqrt(disc);
  if (exit <= 0) return { intensity: 0, bulgeFraction: 0 };
  const inside = c < 0;
  const enter = inside ? 0 : -b - Math.sqrt(disc);

  let tau = 0;
  let disk = 0;
  let bulge = 0;
  const sample = (s: number, ds: number) => {
    const qx = ox + dir[0] * s;
    const qy = oy + dir[1] * s;
    const qz = oz + dir[2] * s;
    const e = rawEmissivity(qx, qy, qz);
    const attenuation = Math.exp(-tau);
    disk += e.disk * attenuation * ds;
    bulge += e.bulge * attenuation * ds;
    const dSun = Math.hypot(origin[0] + dir[0] * s, origin[1] + dir[1] * s, origin[2] + dir[2] * s);
    tau += dustOpacity(qx, qy, qz, dSun) * ds;
    return qz;
  };

  if (inside) {
    // Passos geométricos a partir do observador: a vizinhança pesa mais.
    const ratio = (exit / MARCH.near) ** (1 / MARCH.steps);
    let s0 = 0;
    let s1 = MARCH.near;
    for (let k = 0; k < MARCH.steps && tau < 25; k++) {
      sample(0.5 * (s0 + s1), s1 - s0);
      s0 = s1;
      s1 *= ratio;
    }
  } else {
    let s = enter;
    for (let k = 0; k < OUTSIDE_STEP.maxSteps && s < exit && tau < 25; k++) {
      const z = Math.abs(oz + dir[2] * s);
      const ds = Math.min(Math.max(OUTSIDE_STEP.perHeight * (z + 0.1), OUTSIDE_STEP.min), OUTSIDE_STEP.max, exit - s);
      sample(s + 0.5 * ds, ds);
      s += ds;
    }
  }
  const total = disk + bulge;
  return { intensity: total / SUN_EMISSIVITY, bulgeFraction: total > 0 ? bulge / total : 0 };
}

// ── Mapa do céu ──────────────────────────────────────────────────────────────
/**
 * Mapa equirretangular em coordenadas galácticas (u = l/360° + 0,5 com l em
 * (−180°, 180°], v = b/180° + 0,5): o da Terra serve para todos os destinos, e
 * o shader gira a direção da nave para o referencial galáctico.
 */
export const SKY_MAP_SIZE = { width: 256, height: 128 } as const;
/**
 * Brilho de exibição: x = I/I_ref com I_ref ≈ o disco no plano visto da Terra,
 * longe do bojo. Abaixo dele, x¹ (os polos galácticos ficam escuros e a faixa
 * se destaca); acima, x^0,2, para o centro galáctico, dezenas de milhares de
 * vezes mais brilhante, caber na tela.
 */
export const MILKY_WAY_DISPLAY = { reference: 4, faint: 1, bright: 0.2, gain: 0.07 } as const;

/** Direção galáctica de um texel do mapa. */
export function skyMapDirection(i: number, j: number, width: number, height: number): Vec3 {
  const l = ((i + 0.5) / width - 0.5) * 2 * Math.PI;
  const b = ((j + 0.5) / height - 0.5) * Math.PI;
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
}

/** Brilho de exibição de um brilho superficial do modelo. */
export function milkyWayDisplay(intensity: number): number {
  const x = intensity / MILKY_WAY_DISPLAY.reference;
  return MILKY_WAY_DISPLAY.gain * x ** (x < 1 ? MILKY_WAY_DISPLAY.faint : MILKY_WAY_DISPLAY.bright);
}

/**
 * Mapa do céu difuso visto de `origin`: por texel, log₁₀ do brilho de exibição
 * e a fração do bojo (2 floats).
 */
export function buildSkyMap(origin: Vec3, width: number = SKY_MAP_SIZE.width, height: number = SKY_MAP_SIZE.height): Float32Array {
  const out = new Float32Array(width * height * 2);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const glow = marchGlow(origin, skyMapDirection(i, j, width, height));
      const k = (j * width + i) * 2;
      out[k] = Math.log10(milkyWayDisplay(glow.intensity) + 1e-9);
      out[k + 1] = glow.bulgeFraction;
    }
  }
  return out;
}

/** Posição da nave (heliocêntrica, kpc) a `distanceLy` do Sol na direção do alvo. */
export function shipPositionKpc(targetGalactic: Vec3, distanceLy: number): Vec3 {
  return scale(targetGalactic, distanceLy / KPC_LY);
}

/**
 * Pontos da rota em que o mapa difuso é calculado (anos-luz desde o Sol): o
 * céu só muda na escala de centenas de anos-luz, então as viagens curtas usam
 * só o da partida; rumo ao centro, os pontos se adensam também perto do fim.
 */
export function skyMapKeyframes(targetGalactic: Vec3, distanceLy: number): number[] {
  if (distanceLy < 300) return [0];
  const points = new Set<number>([0, distanceLy]);
  for (let d = 100; d < distanceLy; d *= 1.8) points.add(d);
  // Dentro da galáxia (centro galáctico), o céu muda na escala da distância que falta.
  if (relativeStarDensity(shipPositionKpc(targetGalactic, distanceLy)) > 1e-2) {
    for (let rem = 3; rem < distanceLy; rem *= 1.8) points.add(distanceLy - rem);
  }
  return [...points].filter((d) => d >= 0 && d <= distanceLy).sort((a, b) => a - b);
}

/** Distância (kpc) do ponto ao centro galáctico, para os testes e o painel. */
export const distanceToCenterKpc = (p: Vec3) => length(sub(p, GALACTIC_CENTER));
