import { MOON_LIST, SMALL_BODY_LIST } from './bodies';
import { COMPANIONS, MISSIONS, MISSION_LIST } from './missions';
import { PLANET_LIST } from './planets';
import { formatDateTime, msToDays } from './time';
import { PROBE_RATES, PROBE_TIME_RANGE, useProbeStore, type FocusId, type ScaleMode } from './useProbeStore';

const segmentClass = (active: boolean) =>
  `whitespace-nowrap rounded-sm px-2 py-1 text-[11px] tracking-wider transition-colors max-sm:px-1.5 ${
    active ? 'bg-cyan-400/80 text-black' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
  }`;

const SCALES: readonly { value: ScaleMode; label: string; title: string }[] = [
  { value: 'log', label: 'Log', title: 'Distâncias ao Sol em escala logarítmica: os planetas e as sondas na mesma tela' },
  { value: 'linear', label: 'Real', title: 'Escala real: ideal para ver um sobrevoo ou uma órbita de perto' },
];

/** Data, reprodução, velocidade do tempo, foco da câmera e escala. */
export function ProbeControls({ className = '' }: { className?: string }) {
  const t = useProbeStore((s) => s.t);
  const playing = useProbeStore((s) => s.playing);
  const rate = useProbeStore((s) => s.rate);
  const autoSlow = useProbeStore((s) => s.autoSlow);
  const slowed = useProbeStore((s) => s.slowdown !== null);
  const focus = useProbeStore((s) => s.focus);
  const scale = useProbeStore((s) => s.scale);
  const { togglePlay, setT, setRate, setAutoSlow, setFocus, setScale } = useProbeStore.getState();
  const today = msToDays(Date.now());

  return (
    <section
      aria-label="Controles do tempo"
      className={`flex flex-col gap-2 rounded-md border border-cyan-400/30 bg-black/75 px-3 py-2 font-mono text-xs backdrop-blur-sm ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          className="w-24 shrink-0 rounded-sm bg-cyan-400/80 px-2 py-1 text-[11px] tracking-wider text-black hover:bg-cyan-300"
          onClick={togglePlay}
        >
          {playing ? '❚❚ Pausar' : '▶ Avançar'}
        </button>
        <input
          type="range"
          aria-label="Data"
          className="min-w-32 flex-1 accent-cyan-400"
          min={PROBE_TIME_RANGE.start}
          max={PROBE_TIME_RANGE.end}
          step="any"
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
        />
        <span className="ml-auto shrink-0 text-slate-200 tabular-nums">{formatDateTime(t)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Velocidade do tempo">
          {PROBE_RATES.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={r.value === rate}
              className={segmentClass(r.value === rate)}
              onClick={() => setRate(r.value)}
            >
              {r.label}
            </button>
          ))}
          {slowed && <span className="ml-1 text-[10px] text-amber-300">encontro</span>}
        </div>
        <button
          type="button"
          className="rounded-sm bg-slate-800/80 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
          title="Ir para a data de hoje"
          onClick={() => setT(today)}
        >
          Hoje
        </button>
        <label className="flex items-center gap-1.5 text-slate-300">
          <input type="checkbox" className="accent-cyan-400" checked={autoSlow} onChange={(e) => setAutoSlow(e.target.checked)} />
          Desacelerar nos encontros
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label className="flex items-center gap-1.5">
          <span className="text-slate-400">Foco</span>
          <select
            className="rounded-sm border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-100"
            value={focus}
            onChange={(e) => setFocus(e.target.value as FocusId)}
          >
            <optgroup label="Sol e planetas">
              <option value="sun">Sol</option>
              {PLANET_LIST.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Luas">
              {MOON_LIST.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Cometa e asteroides">
              {SMALL_BODY_LIST.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </optgroup>
            {(['probe', 'apollo'] as const).map((group) => (
              <optgroup key={group} label={group === 'probe' ? 'Sondas' : 'Apollo'}>
                {MISSION_LIST.filter((m) => m.group === group).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                {COMPANIONS.filter((c) => MISSIONS[c.parent].group === group).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name.includes(MISSIONS[c.parent].name) ? c.name : `${c.name} (${MISSIONS[c.parent].name})`}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Escala das distâncias">
          <span className="mr-1 text-slate-400">Escala</span>
          {SCALES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={s.value === scale}
              title={s.title}
              className={segmentClass(s.value === scale)}
              onClick={() => setScale(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
