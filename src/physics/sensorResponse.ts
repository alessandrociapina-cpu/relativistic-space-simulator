/**
 * Resposta de luminância (canal Y) do sensor simulado em `sampleBlackbodySensor`
 * do shader, replicada na CPU para a autoexposição dos instrumentos.
 */
import { T_CMB_0 } from './RelativityEngine';
import { cieXyzBar } from './blackbody';

/** Fator de temperatura de cada `uSensorMode` (Visível, IV, UV, Raios-X). */
const SENSOR_TEMPERATURE_SCALE = [1, 12, 0.15, 0.01] as const;

function planckSafe(lambdaNm: number, temperatureK: number): number {
  const x = 1.438776877e7 / (lambdaNm * temperatureK);
  if (x > 80) return 0;
  const l5 = (550 / lambdaNm) ** 5;
  return l5 / Math.max(x < 1e-4 ? x : Math.expm1(x), 1e-20);
}

/** Nível (antes do tone mapping) em que a autoexposição põe o objeto mais brilhante. */
const AUTO_EXPOSURE_LEVEL = 0.6;
/** Fator de radiância da CMB no shader. */
const CMB_RADIANCE_SCALE = 0.38;
/** O alvo só comanda a exposição quando cobre pelo menos este raio, em pixels. */
const RESOLVED_TARGET_PX = 3;
/**
 * Fora da galáxia, sem estrelas por perto nem CMB no visível, o instrumento integra por mais tempo (uma
 * exposição de céu profundo): as galáxias fracas aparecem.
 */
export const DEEP_FIELD_GAIN = 40;

export interface AutoExposureInput {
  readonly eta: number;
  readonly gamma: number;
  readonly sensorMode: number;
  /** Ângulo de um pixel do instrumento (rad). */
  readonly psfAngleRad: number;
  readonly targetTempK: number;
  /** Raio angular do alvo no referencial de repouso (rad). */
  readonly targetRadiusRestRad: number;
  readonly defaultExposure: number;
  /** Céu profundo: a nave fora da galáxia, sem estrelas por perto (a exposição longa vale se nada brilhar). */
  readonly deepField?: boolean;
}

/**
 * Autoexposição de um instrumento olhando para a frente: mede pelo objeto mais
 * brilhante no campo, o pico da CMB (diluído pela PSF) ou a superfície do alvo
 * quando resolvida. Sem nada brilhante, fica na exposição de céu estrelado, ou
 * na de céu profundo fora da galáxia.
 */
export function instrumentAutoExposure(input: AutoExposureInput): number {
  const dopplerAhead = Math.exp(input.eta);
  const gammaPsf = input.gamma * input.psfAngleRad;
  const cmb =
    (sensorLuminance(T_CMB_0 * dopplerAhead, input.sensorMode) * CMB_RADIANCE_SCALE) / (1 + gammaPsf * gammaPsf);
  // Aberração à frente: tan(θ'/2) = e^(−η)·tan(θ/2)
  const apparentRadius = 2 * Math.atan(Math.exp(-input.eta) * Math.tan(input.targetRadiusRestRad / 2));
  if (apparentRadius >= RESOLVED_TARGET_PX * input.psfAngleRad) {
    const brightest = Math.max(cmb, sensorLuminance(input.targetTempK * dopplerAhead, input.sensorMode));
    if (brightest > 0) return AUTO_EXPOSURE_LEVEL / brightest;
  }
  const starry = input.deepField ? input.defaultExposure * DEEP_FIELD_GAIN : input.defaultExposure;
  return cmb > 0 ? Math.min(starry, AUTO_EXPOSURE_LEVEL / cmb) : starry;
}

const XYZ_TO_LINEAR_SRGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
] as const;

/**
 * Cor linear sRGB que o sensor atribui a um corpo negro de temperatura efetiva
 * T (já multiplicada pelo fator do sensor): 8 amostras de Planck entre 380 e
 * 730 nm pesadas pelas funções de cor CIE.
 */
export function sensorRgb(effectiveTempK: number): [number, number, number] {
  if (effectiveTempK < 250) return [0, 0, 0];
  const dLambda = (730 - 380) / 8;
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < 8; i++) {
    const lambda = 380 + (i + 0.5) * dLambda;
    const b = planckSafe(lambda, effectiveTempK);
    const [xb, yb, zb] = cieXyzBar(lambda);
    x += b * xb;
    y += b * yb;
    z += b * zb;
  }
  const k = dLambda * 0.0015;
  return XYZ_TO_LINEAR_SRGB.map((row) => Math.max((row[0] * x + row[1] * y + row[2] * z) * k, 0)) as [number, number, number];
}

/**
 * Tabela de `sampleBlackbodySensor` para o shader: log₁₀ da cor em 1 024 pontos
 * de log₁₀T entre 2,35 e 15 (interpolada linearmente no shader). Troca 64
 * exponenciais por pixel por duas leituras de textura.
 */
export const SENSOR_LUT = { size: 1024, logMin: 2.35, logMax: 15, floor: 1e-38 } as const;

export function buildSensorLut(): Float32Array {
  const { size, logMin, logMax, floor } = SENSOR_LUT;
  const data = new Float32Array(size * 4);
  for (let i = 0; i < size; i++) {
    const rgb = sensorRgb(10 ** (logMin + ((logMax - logMin) * i) / (size - 1)));
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.log10(Math.max(rgb[c]!, floor));
    data[i * 4 + 3] = 1;
  }
  return data;
}

/** Leitura da tabela como no shader (para os testes). */
export function sampleSensorLut(lut: Float32Array, effectiveTempK: number): [number, number, number] {
  if (effectiveTempK < 250) return [0, 0, 0];
  const { size, logMin, logMax } = SENSOR_LUT;
  const x = Math.min(Math.max(((Math.log10(effectiveTempK) - logMin) / (logMax - logMin)) * (size - 1), 0), size - 1.001);
  const i = Math.floor(x);
  const f = x - i;
  return [0, 1, 2].map((c) => 10 ** (lut[i * 4 + c]! * (1 - f) + lut[(i + 1) * 4 + c]! * f)) as [number, number, number];
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Ganho de uma estrela-alvo que ocupa boa parte de um visor sem autoexposição
 * (o para-brisa): o olho ou a câmera se acostumam ao disco, que de outro modo
 * ficaria escuro numa anã vermelha. Entra aos poucos entre 0,6° e 2,9° de raio
 * aparente e só clareia (nunca escurece) a superfície até o nível da autoexposição.
 */
export function resolvedTargetGain(input: {
  readonly eta: number;
  readonly sensorMode: number;
  readonly targetTempK: number;
  readonly targetRadiusRestRad: number;
  readonly exposure: number;
}): number {
  const apparentRadius = 2 * Math.atan(Math.exp(-input.eta) * Math.tan(input.targetRadiusRestRad / 2));
  const weight = smoothstep(0.01, 0.05, apparentRadius);
  if (weight <= 0) return 1;
  const surface = sensorLuminance(input.targetTempK * Math.exp(input.eta), input.sensorMode) * input.exposure;
  if (!(surface > 0)) return 1;
  return Math.max(1, AUTO_EXPOSURE_LEVEL / surface) ** weight;
}

/** Luminância que o shader atribui a um corpo negro visto com `sensorMode`. */
export function sensorLuminance(apparentTempK: number, sensorMode: number): number {
  const t = apparentTempK * (SENSOR_TEMPERATURE_SCALE[sensorMode] ?? 1);
  if (t < 250) return 0;
  const dLambda = (730 - 380) / 8;
  let y = 0;
  for (let i = 0; i < 8; i++) {
    const lambda = 380 + (i + 0.5) * dLambda;
    y += planckSafe(lambda, t) * cieXyzBar(lambda)[1];
  }
  return y * dLambda * 0.0015;
}
