import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import vertexShader from '../shaders/RelativisticSky.vert?raw';
import fragmentShader from '../shaders/RelativisticSky.frag?raw';
import type { TargetKind } from '../physics/destinations';
import { instrumentAutoExposure } from '../physics/sensorResponse';
import { computeBodyAngularRadii } from '../physics/sky';
import { useFlightStore } from '../store/useFlightStore';

/** Valores de `uSensorMode` no shader. */
export const SensorMode = {
  Visible: 0,
  Infrared: 1,
  Ultraviolet: 2,
  XRay: 3,
} as const;
export type SensorMode = (typeof SensorMode)[keyof typeof SensorMode];

/** Leva o núcleo de uma estrela tipo solar (≈ 1,7×10⁻³ no sensor) ao meio da curva ACES. */
export const DEFAULT_EXPOSURE = 200;

const TARGET_TYPE: Readonly<Record<TargetKind, number>> = { star: 0, blackHole: 1, galaxy: 2 };

// Eixo de voo exatamente em −Z: ver o cabeçalho de RelativisticSky.frag.
const FORWARD = new THREE.Vector3(0, 0, -1);
const SUN_DIR = new THREE.Vector3(0, 0, 1);
const SKY_RADIUS = 10;

/** Zera resíduos de arredondamento (ex.: sin π ≈ 1,2×10⁻¹⁶) para a base ficar exatamente alinhada aos eixos. */
function snapAxis(v: THREE.Vector3): THREE.Vector3 {
  return v.set(
    Math.abs(v.x) < 1e-12 ? 0 : v.x,
    Math.abs(v.y) < 1e-12 ? 0 : v.y,
    Math.abs(v.z) < 1e-12 ? 0 : v.z,
  );
}

function createSkyMaterial() {
  const uniforms = {
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamForward: { value: new THREE.Vector3(0, 0, -1) },
    uTanHalfFov: { value: new THREE.Vector2(1, 1) },
    uViewportSize: { value: new THREE.Vector2(1, 1) },
    uBeta: { value: 0 },
    uGamma: { value: 1 },
    uOneMinusBeta: { value: 1 },
    uForward: { value: FORWARD },
    uTime: { value: 0 },
    uSunDir: { value: SUN_DIR },
    uSunRadiusRad: { value: 0 },
    uTargetDir: { value: FORWARD },
    uTargetRadiusRad: { value: 0 },
    uTargetTemp: { value: 0 },
    uTargetType: { value: 0 },
    uSensorMode: { value: SensorMode.Visible as SensorMode },
    uPsfAngleRad: { value: 1e-3 },
    uExposure: { value: DEFAULT_EXPOSURE },
    uEyeSensitivity: { value: 1 },
    uGlareIntensity: { value: 0 },
    uGlareColor: { value: new THREE.Vector3(1, 1, 1) },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  return { material, uniforms };
}

interface RelativisticSkyProps {
  sensorMode?: SensorMode;
  exposure?: number;
  /** Aplica a adaptação da retina e o véu de espalhamento (só no para-brisa, onde o piloto olha). */
  pilotEye?: boolean;
  /** Autoexposição de instrumento voltado para a frente (telescópio). */
  autoExposure?: boolean;
}

export function RelativisticSky({
  sensorMode = SensorMode.Visible,
  exposure = DEFAULT_EXPOSURE,
  pilotEye = false,
  autoExposure = false,
}: RelativisticSkyProps) {
  const { material, uniforms: u } = useMemo(createSkyMaterial, []);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera, gl, clock }) => {
    const { flight, destination, photometry } = useFlightStore.getState();
    const bodies = computeBodyAngularRadii(flight, destination);
    const cam = camera as THREE.PerspectiveCamera;

    // Base da câmera em 64 bits (colunas da matriz de mundo).
    cam.updateMatrixWorld();
    u.uCamRight.value.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    u.uCamUp.value.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    u.uCamForward.value.setFromMatrixColumn(cam.matrixWorld, 2).normalize().negate();
    snapAxis(u.uCamRight.value);
    snapAxis(u.uCamUp.value);
    snapAxis(u.uCamForward.value);
    const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    u.uTanHalfFov.value.set(tanY * cam.aspect, tanY);
    gl.getDrawingBufferSize(u.uViewportSize.value);
    // PSF ≈ ângulo subtendido por um pixel físico deste monitor
    u.uPsfAngleRad.value = (2 * tanY) / u.uViewportSize.value.y;

    u.uBeta.value = flight.beta;
    u.uGamma.value = flight.gamma;
    u.uOneMinusBeta.value = flight.oneMinusBeta;
    u.uTime.value = clock.elapsedTime;
    u.uSunRadiusRad.value = bodies.sunRadiusRad;
    u.uTargetRadiusRad.value = bodies.targetRadiusRad;
    u.uTargetTemp.value = destination.temperatureK;
    u.uTargetType.value = TARGET_TYPE[destination.kind];
    u.uSensorMode.value = sensorMode;
    u.uExposure.value = autoExposure
      ? instrumentAutoExposure({
          eta: flight.eta,
          gamma: flight.gamma,
          sensorMode,
          psfAngleRad: u.uPsfAngleRad.value,
          targetTempK: destination.temperatureK,
          targetRadiusRestRad: bodies.targetRadiusRad,
          defaultExposure: exposure,
        })
      : exposure;
    u.uEyeSensitivity.value = pilotEye ? photometry.eyeSensitivity : 1;
    u.uGlareIntensity.value = pilotEye ? photometry.glareIntensity : 0;
    u.uGlareColor.value.set(...photometry.glareColor);
  });

  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[SKY_RADIUS, 64, 32]} />
    </mesh>
  );
}
