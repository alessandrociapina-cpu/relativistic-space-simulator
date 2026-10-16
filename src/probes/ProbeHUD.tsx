import { useEffect, useRef, useState } from 'react';
import { formatProse as num, formatSpan } from '../ui/format';
import { BODIES, bodyState } from './bodies';
import { distanceText } from './eventExplanations';
import { MISSIONS, MISSION_LIST, ofBody, type ProbeMission } from './missions';
import { AU_KM, DAY_S, currentEncounter, lightTimeS, probeState, solarEscapeKms, speedKms } from './probes';
import { daysToMs, formatDate, msToDays } from './time';
import { useProbeStore } from './useProbeStore';
import { dot, norm, sub } from './vec3';

/** "302 milhões de km", "25,7 bilhões de km". */
const kmText = (km: number) => (km < 1e9 ? `${num(km / 1e6)} milhões de km` : `${num(km / 1e9)} bilhões de km`);
const year = (days: number) => new Date(daysToMs(days)).getUTCFullYear();

/** "1977–", "1989–2003", "1970". */
function missionYears(m: ProbeMission): string {
  const start = year(m.trajectory.launch);
  const end = m.endsAtTrajectoryEnd ? year(m.trajectory.end) : m.lastContact !== undefined ? year(m.lastContact) : null;
  if (end === null) return `${start}–`;
  return end === start ? `${start}` : `${start}–${end}`;
}

function Readout({ label, value, detail, wide = false }: { label: string; value: string; detail?: string | undefined; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <div className="truncate text-[9px] tracking-widest text-cyan-300/70 uppercase">{label}</div>
      <div className="truncate text-sm text-slate-100 tabular-nums">{value}</div>
      {detail && <div className="truncate text-[10px] text-slate-500 tabular-nums">{detail}</div>}
    </div>
  );
}

const Badge = ({ className, children }: { className: string; children: string }) => (
  <span className={`rounded-sm px-1.5 ${className}`}>{children}</span>
);

/** Botão com a sonda escolhida e a lista das 12, em ordem de lançamento. */
function ProbePicker({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const selected = useProbeStore((s) => s.selected);
  const setSelected = useProbeStore((s) => s.setSelected);
  const root = useRef<HTMLDivElement>(null);
  const mission = MISSIONS[selected];

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open, setOpen]);

  return (
    <div ref={root} className="relative mb-1.5">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sonda: ${mission.name}`}
        className="flex w-full items-center gap-2 rounded-sm bg-slate-800/90 px-2 py-1 text-left text-[12px] text-white hover:bg-slate-700"
        onClick={() => setOpen(!open)}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: mission.color }} />
        <span className="min-w-0 flex-1 truncate">
          {mission.name} <span className="text-slate-400">· {missionYears(mission)}</span>
        </span>
        <span aria-hidden className="text-slate-400">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Sondas"
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-[60vh] overflow-y-auto rounded-md border border-cyan-400/30 bg-slate-950/95 py-1 shadow-2xl"
        >
          {MISSION_LIST.map((m) => (
            <li key={m.id} role="option" aria-selected={m.id === selected}>
              <button
                type="button"
                className={`flex w-full items-start gap-2 px-2 py-1 text-left hover:bg-slate-800 ${m.id === selected ? 'bg-slate-800/80' : ''}`}
                onClick={() => {
                  setSelected(m.id);
                  setOpen(false);
                }}
              >
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="min-w-0">
                  <span className="block text-[12px] text-slate-100">
                    {m.name} <span className="text-slate-500">· {missionYears(m)}</span>
                  </span>
                  <span className="block text-[10px] leading-snug text-slate-400">{m.tagline}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Painel da sonda escolhida: distâncias, tempo-luz, velocidade contra o escape do Sol e próximo evento. */
export function ProbeHUD({ className = '' }: { className?: string }) {
  const t = useProbeStore((s) => s.t);
  const selected = useProbeStore((s) => s.selected);
  const jumpToEvent = useProbeStore((s) => s.jumpToEvent);
  const mission = MISSIONS[selected];
  const { trajectory } = mission;
  // Com a lista aberta, o painel sobe acima do cartão do evento.
  const [pickerOpen, setPickerOpen] = useState(false);
  const state = probeState(trajectory, t);
  const next = mission.events.find((e) => e.t > t);
  const crossedHeliopause = mission.events.some((e) => e.kind === 'heliopause' && e.t <= t);
  const today = msToDays(Date.now());

  let body;
  if (t < trajectory.launch) {
    body = <Readout label="Lançamento em" value={formatSpan((trajectory.launch - t) * DAY_S)} detail={formatDate(trajectory.launch)} />;
  } else if (!state) {
    const finale = [...mission.events].reverse().find((e) => e.kind === 'end' || e.kind === 'landing');
    body = mission.endsAtTrajectoryEnd ? (
      <Readout
        label="Missão encerrada"
        value={`${formatDate(trajectory.end)}${finale ? ` · ${finale.title}` : ''}`}
        detail={`Duração: ${formatSpan((trajectory.end - trajectory.launch) * DAY_S)}`}
        wide
      />
    ) : (
      <Readout label="Fim dos dados do JPL" value={formatDate(trajectory.end)} detail="A trajetória publicada termina aqui." wide />
    );
  } else {
    const r = norm(state.position);
    const toEarth = norm(sub(state.position, bodyState('earth', t)!.position));
    const speed = speedKms(state.velocity);
    const escape = solarEscapeKms(r);
    const encounter = currentEncounter(trajectory, t);
    const near = encounter && encounter.kind !== 'departure' ? encounter.body : null;
    const nearState = near ? bodyState(near, t) : null;
    const rel = nearState ? { r: sub(state.position, nearState.position), v: sub(state.velocity, nearState.velocity) } : null;
    const relKm = rel ? norm(rel.r) * AU_KM : 0;
    const relKms = rel ? speedKms(rel.v) : 0;
    const bound = near && rel ? (relKms * relKms) / 2 - BODIES[near].gm / relKm < 0 && encounter!.kind === 'orbit' : false;
    const silent = mission.lastContact !== undefined && t > mission.lastContact;
    const landed = mission.reconstruction && t >= mission.reconstruction.landingT;
    const approaching = rel ? dot(rel.r, rel.v) < 0 : false;
    body = (
      <>
        <div className="mb-1 flex flex-wrap gap-1 text-[9px] tracking-widest uppercase">
          {speed > escape && !near && <Badge className="bg-emerald-500/85 text-black">Escapando do Sistema Solar</Badge>}
          {crossedHeliopause && <Badge className="bg-violet-400/90 text-black">Espaço interestelar</Badge>}
          {bound && near && !landed && <Badge className="bg-sky-400/90 text-black">{`Em órbita ${ofBody(near)}`}</Badge>}
          {landed && <Badge className="bg-orange-400/90 text-black">No solo de Vênus</Badge>}
          {mission.reconstruction && <Badge className="bg-slate-600 text-slate-100">Rota reconstruída</Badge>}
          {silent && <Badge className="bg-slate-600 text-slate-100">{`Sem contato desde ${year(mission.lastContact!)}`}</Badge>}
          {t > today && <Badge className="bg-slate-700 text-slate-300">Previsão</Badge>}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {near && (
            <Readout
              label={`Distância ${ofBody(near)}`}
              value={landed ? 'no solo' : distanceText(relKm)}
              detail={landed ? undefined : `${relKms < 1 ? `${num(relKms * 1000)} m/s` : `${num(relKms)} km/s`} · ${approaching ? 'aproximando' : 'afastando'}`}
              wide
            />
          )}
          <Readout label="Distância do Sol" value={`${num(r)} UA`} detail={kmText(r * AU_KM)} />
          <Readout label="Distância da Terra" value={`${num(toEarth)} UA`} detail={`sinal leva ${formatSpan(lightTimeS(toEarth))}`} />
          <Readout label="Velocidade (Sol)" value={`${num(speed)} km/s`} detail={`escape aqui: ${num(escape)} km/s`} />
          <Readout label="Em voo há" value={formatSpan((t - trajectory.launch) * DAY_S)} />
        </div>
      </>
    );
  }

  return (
    <section
      aria-label="Sonda"
      className={`relative rounded-md border border-cyan-400/30 bg-black/75 px-3 py-2 font-mono backdrop-blur-sm ${pickerOpen ? 'z-30' : ''} ${className}`}
    >
      <ProbePicker open={pickerOpen} setOpen={setPickerOpen} />
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
