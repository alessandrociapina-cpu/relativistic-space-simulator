import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import vertexShader from '../shaders/RelativisticSky.vert?raw';
import fragmentShader from '../shaders/RelativisticSky.frag?raw';
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

// Eixo de voo exatamente em −Z: ver o cabeçalho de RelativisticSky.frag.
const FORWARD = new THREE.Vector3(0, 0, -1);
const SUN_DIR = new THREE.Vector3(0, 0, 1);
const SKY_RADIUS = 10;

function createSkyMaterial() {
  const uniforms = {
    uBeta: { value: 0 },
    uGamma: { value: 1 },
    uOneMinusBeta: { value: 1 },
    uForward: { value: FORWARD },
    uSunDir: { value: SUN_DIR },
    uSunRadiusRad: { value: 0 },
    uTargetDir: { value: FORWARD },
    uTargetRadiusRad: { value: 0 },
    uTargetTemp: { value: 0 },
    uSensorMode: { value: SensorMode.Visible as SensorMode },
    uPsfAngleRad: { value: 1e-3 },
    uExposure: { value: DEFAULT_EXPOSURE },
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
}

export function RelativisticSky({ sensorMode = SensorMode.Visible, exposure = DEFAULT_EXPOSURE }: RelativisticSkyProps) {
  const { material, uniforms: u } = useMemo(createSkyMaterial, []);
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera, size, viewport }) => {
    const { flight, destination } = useFlightStore.getState();
    const bodies = computeBodyAngularRadii(flight, destination);
    u.uBeta.value = flight.beta;
    u.uGamma.value = flight.gamma;
    u.uOneMinusBeta.value = flight.oneMinusBeta;
    u.uSunRadiusRad.value = bodies.sunRadiusRad;
    u.uTargetRadiusRad.value = bodies.targetRadiusRad;
    u.uTargetTemp.value = destination.temperatureK;
    u.uSensorMode.value = sensorMode;
    u.uExposure.value = exposure;
    // PSF ≈ ângulo subtendido por um pixel físico deste monitor
    const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov);
    u.uPsfAngleRad.value = fov / (size.height * viewport.dpr);
  });

  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[SKY_RADIUS, 64, 32]} />
    </mesh>
  );
}
