import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { CockpitMonitor } from './CockpitMonitor';
import { RelativisticSky, SensorMode } from './RelativisticSky';

const TELESCOPE_FOV_DEG = 5;

const SENSORS: readonly { mode: SensorMode; label: string; title: string }[] = [
  { mode: SensorMode.Visible, label: 'VIS', title: 'Visível (380–750 nm)' },
  { mode: SensorMode.Infrared, label: 'IV', title: 'Infravermelho' },
  { mode: SensorMode.Ultraviolet, label: 'UV', title: 'Ultravioleta' },
  { mode: SensorMode.XRay, label: 'RX', title: 'Raios-X' },
];

/** Monitor esquerdo: telescópio multiespectral fixo na direção de voo (−Z). */
export function TelescopePIP({ className = '' }: { className?: string }) {
  const [sensorMode, setSensorMode] = useState<SensorMode>(SensorMode.Visible);
  const active = SENSORS.find((s) => s.mode === sensorMode);

  return (
    <CockpitMonitor
      title="Telescópio"
      subtitle={`${active?.title ?? ''} · ${TELESCOPE_FOV_DEG}°`}
      className={className}
      footer={
        <div className="grid grid-cols-4 gap-1 p-1" role="radiogroup" aria-label="Sensor do telescópio">
          {SENSORS.map((s) => (
            <button
              key={s.mode}
              type="button"
              role="radio"
              aria-checked={s.mode === sensorMode}
              title={s.title}
              onClick={() => setSensorMode(s.mode)}
              className={`rounded-sm px-1 py-1 text-[11px] tracking-wider transition-colors ${
                s.mode === sensorMode
                  ? 'bg-cyan-400/80 text-black'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      }
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: false }}
        camera={{ position: [0, 0, 0], rotation: [0, 0, 0], fov: TELESCOPE_FOV_DEG, near: 0.1, far: 100 }}
      >
        <RelativisticSky sensorMode={sensorMode} />
      </Canvas>
    </CockpitMonitor>
  );
}
