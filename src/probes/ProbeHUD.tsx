import { formatProse as num, formatSpan } from '../ui/format';
import { MISSIONS, MISSION_LIST } from './missions';
import { planetPosition } from './planets';
import { AU_KM, DAY_S, lightTimeS, probePosition, probeVelocity, solarEscapeKms, speedKms } from './probes';
import { formatDate } from './time';
import { useProbeStore } from './useProbeStore';
import { norm, sub } from './vec3';

/** "302 milhões de km", "25,7 bilhões de km". */
const kmText = (km: number) => (km < 1e9 ? `${num(km / 1e6)} milhões de km` : `${num(km / 1e9)} bilhões de km`);

function Readout({ label, value, detail }: { label: string; value: string; detail?: string | undefined }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[9px] tracking-widest text-cyan-300/70 uppercase">{label}</div>
      <div className="truncate text-sm text-slate-100 tabular-nums">{value}</div>
      {detail && <div className="truncate text-[10px] text-slate-500 tabular-nums">{detail}</div>}
    </div>
  );
}

/** Painel da sonda escolhida: distâncias, tempo-luz, velocidade contra o escape do Sol e próximo evento. */
export function ProbeHUD({ className = '' }: { className?: string }) {
  const t = useProbeStore((s) => s.t);
  const selected = useProbeStore((s) => s.selected);
  const setSelected = useProbeStore((s) => s.setSelected);
  const jumpToEvent = useProbeStore((s) => s.jumpToEvent);
  const mission = MISSIONS[selected];
  const p = probePosition(mission.trajectory, t);
  const next = mission.events.find((e) => e.t > t);
  const crossedHeliopause = mission.events.some((e) => e.kind === 'heliopause' && e.t <= t);

  let body;
  if (!p) {
    body = <Readout label="Lançamento em" value={formatSpan((mission.trajectory.launch - t) * DAY_S)} detail={formatDate(mission.trajectory.launch)} />;
  } else {
    const r = norm(p);
    const toEarth = norm(sub(p, planetPosition('earth', t)));
    const speed = speedKms(probeVelocity(mission.trajectory, t));
    const escape = solarEscapeKms(r);
    body = (
      <>
        <div className="mb-1 flex flex-wrap gap-1 text-[9px] tracking-widest uppercase">
          {speed > escape && <span className="rounded-sm bg-emerald-500/85 px-1.5 text-black">Escapando do Sistema Solar</span>}
          {crossedHeliopause && <span className="rounded-sm bg-violet-400/90 px-1.5 text-black">Espaço interestelar</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Readout label="Distância do Sol" value={`${num(r)} UA`} detail={kmText(r * AU_KM)} />
          <Readout label="Distância da Terra" value={`${num(toEarth)} UA`} detail={`sinal leva ${formatSpan(lightTimeS(toEarth))}`} />
          <Readout label="Velocidade (Sol)" value={`${num(speed)} km/s`} detail={`escape aqui: ${num(escape)} km/s`} />
          <Readout label="Em voo há" value={formatSpan((t - mission.trajectory.launch) * DAY_S)} />
        </div>
      </>
    );
  }

  return (
    <section aria-label="Sonda" className={`rounded-md border border-cyan-400/30 bg-black/75 px-3 py-2 font-mono backdrop-blur-sm ${className}`}>
      <div className="mb-1.5 flex gap-1" role="radiogroup" aria-label="Sonda">
        {MISSION_LIST.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={m.id === selected}
            className={`flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] transition-colors ${
              m.id === selected ? 'bg-slate-700 text-white' : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800'
            }`}
            onClick={() => setSelected(m.id)}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
            {m.name}
          </button>
        ))}
      </div>
      {body}
      {next && (
        <button
          type="button"
          className="mt-1.5 block w-full truncate text-left text-[10px] text-slate-400 hover:text-slate-200"
          onClick={() => jumpToEvent(next.id)}
        >
          Próximo: <span className="text-amber-300">{next.title}</span> · {formatDate(next.t)}
        </button>
      )}
    </section>
  );
}
