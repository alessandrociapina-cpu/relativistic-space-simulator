import { useEffect, useRef, useState } from 'react';
import { BODIES, MOON_LIST, SMALL_BODY_LIST } from './bodies';
import { COMPANIONS, MISSIONS, MISSION_LIST } from './missions';
import { PLANET_LIST } from './planets';
import { frameBody } from './sceneMath';
import { formatLiveDateTime, msToDays } from './time';
import { PROBE_RATES, PROBE_TIME_RANGE, useProbeStore, type FocusId, type FrameMode, type ScaleMode } from './useProbeStore';

const segmentClass = (active: boolean) =>
  `whitespace-nowrap rounded-sm px-2 py-1 text-[11px] tracking-wider transition-colors max-sm:px-1.5 ${
    active ? 'bg-cyan-400/80 text-black' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
  }`;

const SCALES: readonly { value: ScaleMode; label: string; title: string }[] = [
  { value: 'log', label: 'Log', title: 'Distâncias ao Sol em escala logarítmica: os planetas e as sondas na mesma tela' },
  { value: 'linear', label: 'Real', title: 'Escala real: ideal para ver um sobrevoo ou uma órbita de perto' },
];

const FRAME_TITLES: Readonly<Record<FrameMode, string>> = {
  auto:
    'Automático: em escala real, os rastros ficam no referencial do corpo em foco ou do planeta que a sonda em foco está visitando ' +
    '(a órbita em torno dele aparece como órbita e o sobrevoo como a hipérbole); fora dos encontros e na escala log, no do Sol',
  sun: 'Sempre o referencial do Sol: a rota em torno do Sol, também durante os encontros',
};

/** Verdadeiro por alguns segundos depois que `value` muda (não na montagem). */
function useFlashOnChange(value: unknown, ms = 3200): boolean {
  const [flash, setFlash] = useState(false);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return flash;
}

/** Data, reprodução, velocidade do tempo, foco da câmera e escala. */
export function ProbeControls({ className = '' }: { className?: string }) {
  const t = useProbeStore((s) => s.t);
  const playing = useProbeStore((s) => s.playing);
  const rate = useProbeStore((s) => s.rate);
  const autoSlow = useProbeStore((s) => s.autoSlow);
  const slowed = useProbeStore((s) => s.slowdown !== null);
  const focus = useProbeStore((s) => s.focus);
  const scale = useProbeStore((s) => s.scale);
  const showOthers = useProbeStore((s) => s.showOthers);
  const frameMode = useProbeStore((s) => s.frameMode);
  // O que o modo automático escolheria agora; muda ao entrar ou sair de uma janela de encontro.
  const autoFrame = useProbeStore((s) => frameBody(s.focus, s.t, s.scale));
  const frame = frameMode === 'sun' ? null : autoFrame;
  const frameName = frame ? BODIES[frame].name : 'Sol';
  const frameFlash = useFlashOnChange(frameName);
  // No celular, foco, escala e referencial ficam atrás de "⚙ Opções" para a cena ganhar espaço.
  const [optionsOpen, setOptionsOpen] = useState(false);
  const { togglePlay, setT, setRate, setAutoSlow, setFocus, setScale, setShowOthers, setFrameMode } = useProbeStore.getState();
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
        <span className="ml-auto shrink-0 text-slate-200 tabular-nums">{formatLiveDateTime(t)}</span>
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
        {/* Recolhido, a troca de referencial acende o próprio botão (a rota muda de forma de repente). */}
        <button
          type="button"
          aria-expanded={optionsOpen}
          aria-controls="probe-options"
          className={`ml-auto rounded-sm bg-slate-800/80 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 sm:hidden ${
            frameFlash && !optionsOpen ? 'animate-beacon text-amber-200 ring-2 ring-amber-300/90' : ''
          }`}
          onClick={() => setOptionsOpen((o) => !o)}
        >
          ⚙ Opções {optionsOpen ? '▴' : '▾'}
          {frameFlash && !optionsOpen && <span className="ml-1">· {frameName}</span>}
        </button>
      </div>
      <div id="probe-options" className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${optionsOpen ? '' : 'max-sm:hidden'}`}>
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
        {/* O referencial em uso, com um destaque quando ele muda (a rota muda de forma de repente). */}
        <div
          className={`flex items-center gap-1 rounded-sm ${frameFlash ? 'animate-beacon ring-2 ring-amber-300/90 ring-offset-2 ring-offset-black' : ''}`}
          role="radiogroup"
          aria-label="Referencial dos rastros"
        >
          <span className={`mr-1 ${frameFlash ? 'text-amber-300' : 'text-slate-400'}`}>Referencial</span>
          <button
            type="button"
            role="radio"
            aria-checked={frameMode === 'auto'}
            title={FRAME_TITLES.auto}
            className={`min-w-[7.5rem] ${segmentClass(frameMode === 'auto')}`}
            onClick={() => setFrameMode('auto')}
          >
            Auto · {autoFrame ? BODIES[autoFrame].name : 'Sol'}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={frameMode === 'sun'}
            title={FRAME_TITLES.sun}
            className={segmentClass(frameMode === 'sun')}
            onClick={() => setFrameMode('sun')}
          >
            Sol
          </button>
          <span className="sr-only" aria-live="polite">
            Referencial: {frameName}
          </span>
        </div>
        <label className="flex items-center gap-1.5 text-slate-300" title="Desligado: só a missão escolhida (e as companheiras) aparece na cena, sem as outras sondas e suas rotas">
          <input type="checkbox" className="accent-cyan-400" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} />
          Mostrar outras sondas
        </label>
        <p className="basis-full text-[10px] text-slate-500 sm:ml-auto sm:basis-auto">
          Trajetórias do JPL Horizons; Veneras, Mariner 10, Vikings, Magellan e Apollo reconstruídas
        </p>
      </div>
    </section>
  );
}
