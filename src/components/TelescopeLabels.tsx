import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, type PerspectiveCamera } from 'three';
import { LIGHT_YEAR_M } from '../physics/RelativityEngine';
import { placeSkyLabels, skyLabelSources, type PinnedLabel, type SkyView } from '../sky/skyLabels';
import { useFlightStore } from '../store/useFlightStore';
import { useCockpitUi, type TelescopeDirection } from '../ui/cockpitUi';
import type { SkyReadout } from './RelativisticSky';

/** Rótulos no máximo por tela: menos no monitor estreito do celular. */
const MAX_LABELS = 8;
const MAX_LABELS_NARROW = 5;
const NARROW_PX = 280;

export type LabelNodes = MutableRefObject<(HTMLDivElement | null)[]>;

/**
 * Os rótulos sobre a tela do telescópio: um marcador em volta do objeto real e o nome ao lado. Os nós são fixos
 * e o `TelescopeLabelTracker` os move a cada quadro, sem renderizar o React. A tecla "Nomes" liga e desliga.
 */
export function TelescopeLabelLayer({ nodes }: { nodes: LabelNodes }) {
  const on = useCockpitUi((s) => s.skyLabels);
  const toggle = useCockpitUi((s) => s.toggleSkyLabels);
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: MAX_LABELS }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              nodes.current[i] = el;
            }}
            style={{ display: 'none' }}
            className="group absolute top-0 left-0 will-change-transform"
          >
            {/* Contorno escuro no marcador e fundo escuro no nome: legíveis também sobre o céu claro da CMB. */}
            <span className="absolute -top-[4.5px] -left-[4.5px] h-[9px] w-[9px] rounded-full border border-cyan-200 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] group-data-[kind=galaxy]:border-violet-300 group-data-[kind=origin]:border-amber-200 group-data-[kind=target]:border-amber-200" />
            <span className="font-readout absolute -top-[6px] left-[7px] rounded-[2px] bg-black/60 px-[2px] text-[9px] leading-[11px] whitespace-nowrap text-cyan-50 group-data-[flip=true]:right-[7px] group-data-[flip=true]:left-auto group-data-[kind=galaxy]:text-violet-100 group-data-[kind=origin]:text-amber-100 group-data-[kind=target]:text-amber-100" />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        title="Nomes das estrelas e galáxias reais (catálogos HYG e OpenNGC) que aparecem no telescópio"
        className={`font-display absolute top-1 right-1 rounded-sm border px-1 py-px text-[8px] tracking-[0.15em] uppercase backdrop-blur-[1px] ${
          on ? 'border-cyan-300/60 bg-cyan-950/60 text-cyan-100' : 'border-slate-600/60 bg-black/50 text-slate-400'
        }`}
      >
        {on ? '◉' : '○'} Nomes
      </button>
    </>
  );
}

/**
 * Dentro do Canvas do telescópio, depois do céu: põe os rótulos dos objetos reais que aparecem no quadro, com
 * a câmera, a exposição e a PSF que o céu acabou de usar.
 */
export function TelescopeLabelTracker({
  direction,
  sensorMode,
  readout,
  nodes,
  originVisible,
}: {
  direction: TelescopeDirection;
  sensorMode: number;
  readout: SkyReadout;
  nodes: LabelNodes;
  /** A estrela de partida aparece neste sensor (atrás, o Doppler e^(−η) pode tirá-la do visível). */
  originVisible: boolean;
}) {
  useFrame(({ camera, size }) => {
    const { flight, destination, origin } = useFlightStore.getState();
    let labels: ReturnType<typeof placeSkyLabels> = [];
    if (useCockpitUi.getState().skyLabels) {
      const cam = camera as PerspectiveCamera;
      const tanY = Math.tan(MathUtils.degToRad(cam.fov) / 2);
      const view: SkyView = {
        direction,
        widthPx: size.width,
        heightPx: size.height,
        tanHalfFovX: tanY * cam.aspect,
        tanHalfFovY: tanY,
        psfAngleRad: readout.psfAngleRad,
        exposure: readout.exposure,
        backgroundGain: readout.backgroundGain,
        sensorMode,
      };
      const pinned: PinnedLabel[] =
        direction === 'front'
          ? destination.kind === 'void'
            ? []
            : [{ name: destination.name, kind: 'target' }]
          : originVisible
            ? [{ name: origin.starName, kind: 'origin' }]
            : [];
      labels = placeSkyLabels(
        skyLabelSources(destination, origin),
        flight.positionM / LIGHT_YEAR_M,
        flight,
        view,
        pinned,
        size.width < NARROW_PX ? MAX_LABELS_NARROW : MAX_LABELS,
      );
    }
    nodes.current.forEach((el, i) => {
      if (!el) return;
      const label = labels[i];
      if (!label) {
        if (el.style.display !== 'none') el.style.display = 'none';
        return;
      }
      el.style.display = '';
      el.style.transform = `translate3d(${label.x.toFixed(1)}px, ${label.y.toFixed(1)}px, 0)`;
      el.dataset.kind = label.kind;
      el.dataset.flip = String(label.flip);
      const text = el.lastElementChild;
      if (text && text.textContent !== label.name) text.textContent = label.name;
    });
  });
  return null;
}
