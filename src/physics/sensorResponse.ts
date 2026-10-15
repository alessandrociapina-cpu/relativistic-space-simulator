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
}

/**
 * Autoexposição de um instrumento olhando para a frente: mede pelo objeto mais
 * brilhante no campo, o pico da CMB (diluído pela PSF) ou a superfície do alvo
 * quando resolvida. Sem nada brilhante, fica na exposição de céu estrelado.
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
  return cmb > 0 ? Math.min(input.defaultExposure, AUTO_EXPOSURE_LEVEL / cmb) : input.defaultExposure;
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
