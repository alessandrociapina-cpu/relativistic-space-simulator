import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { rocketMassRatio, type MissionProfile } from '../physics/RelativityEngine';
import {
  assessMission,
  longestBurnS,
  presetsFor,
  type AccelerationPreset,
  type CrewKind,
  type MissionAssessment,
} from '../physics/accelerationPresets';
import { REST_RATIOS, missionProfileFor, plannedCoastEta } from '../physics/crewRest';
import { DESTINATION_LIST, MAX_COAST_FRACTION, destinationMissionProfile, type Destination } from '../physics/destinations';
import { useFlightStore, type MissionChoice } from '../store/useFlightStore';
import { APP_HASH } from '../ui/appMode';
import { useCockpitUi } from '../ui/cockpitUi';
import { formatAccelG, formatCompact, formatGamma, formatProse, formatSpan, formatVelocity } from '../ui/format';

/** Faixa da aceleração personalizada: 0,1 g a 10⁷ g. */
const MIN_ACCEL_G = 0.1;
const MAX_ACCEL_G = 1e7;
/** Velocidade de cruzeiro sugerida ao ligar o perfil com inércia (fração de c). */
const DEFAULT_COAST_BETA = 0.9;
/** Menor rapidez de cruzeiro do slider (β ≈ 0,05). */
const MIN_COAST_ETA = 0.05;

const KIND_LABEL: Readonly<Record<Destination['kind'], string>> = {
  star: 'estrela',
  blackHole: 'buraco negro',
  galaxy: 'galáxia',
};

const CREW_OPTIONS: readonly { crew: CrewKind; icon: string; label: string; text: string }[] = [
  {
    crew: 'crewed',
    icon: '🧑‍🚀',
    label: 'Piloto humano',
    text: 'Você vê pelo para-brisa, com os olhos de um piloto: eles se ofuscam e se adaptam à luz.',
  },
  {
    crew: 'robotic',
    icon: '🤖',
    label: 'Sonda robótica',
    text: 'Sem tripulação: as imagens vêm das câmeras de bordo, e o limite é a resistência dos materiais.',
  },
];

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="font-display flex items-center gap-2 text-[11px] tracking-[0.25em] text-cyan-300 uppercase">
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-cyan-300/60 text-[10px]">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

const optionClass = (active: boolean) =>
  `w-full rounded-lg border px-3 py-2 text-left transition-colors ${
    active
      ? 'border-cyan-300/80 bg-cyan-400/15 shadow-[0_0_18px_rgba(34,211,238,0.15)]'
      : 'border-slate-700/80 bg-slate-900/60 hover:border-slate-500 hover:bg-slate-800/60'
  }`;

function ViabilityMark({ viability }: { viability: MissionAssessment['viability'] }) {
  return viability === 'ok' ? (
    <span className="text-emerald-300" title="Suportável">
      ✓
    </span>
  ) : viability === 'over-limit' ? (
    <span className="text-amber-300" title="Além do limite">
      ⚠
    </span>
  ) : (
    <span className="text-rose-300" title="Hipotética">
      ✕
    </span>
  );
}

function PresetCard({
  preset,
  destination,
  coastEta,
  restRatio,
  active,
  onSelect,
}: {
  preset: AccelerationPreset;
  destination: Destination;
  coastEta: number | null;
  restRatio: number;
  active: boolean;
  onSelect: () => void;
}) {
  const profile = missionProfileFor(
    destination,
    preset.accelG,
    plannedCoastEta(destination, preset.accelG, coastEta, preset.crew, restRatio),
    preset.crew,
    restRatio,
  );
  const { viability, rests } = assessMission(preset.crew, preset.accelG, profile);
  return (
    <button type="button" role="radio" aria-checked={active} className={optionClass(active)} onClick={onSelect}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-readout text-lg whitespace-nowrap text-slate-50">{preset.label}</span>
        <span className="flex items-baseline gap-1">
          {rests && <span className="text-[10px] text-emerald-300/80">com descansos</span>}
          <ViabilityMark viability={viability} />
        </span>
      </div>
      <div className="text-[13px] font-semibold text-cyan-100">{preset.title}</div>
      <div className="text-[11px] leading-snug text-slate-400">
        {preset.protection} · {preset.enduranceText}
      </div>
      <div className="font-readout mt-0.5 text-[11px] text-slate-200 tabular-nums">
        {formatSpan(profile.tauTotal)} a bordo · {formatSpan(profile.tTotal)} na Terra
      </div>
    </button>
  );
}

function CustomAcceleration({
  accelG,
  active,
  onChange,
}: {
  accelG: number;
  active: boolean;
  onChange: (g: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (g: number) => {
    if (g >= MIN_ACCEL_G && g <= MAX_ACCEL_G) onChange(g);
  };
  return (
    <div className={optionClass(active)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-cyan-100">Personalizada</span>
        <label className="flex min-w-0 items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            aria-label="Aceleração própria em g"
            className="font-readout w-24 min-w-0 rounded-sm border border-slate-700 bg-slate-950 px-1 py-0.5 text-right text-slate-100 tabular-nums"
            min={MIN_ACCEL_G}
            max={MAX_ACCEL_G}
            step="0.1"
            value={draft ?? String(accelG)}
            onFocus={() => onChange(accelG)}
            onChange={(e) => {
              setDraft(e.target.value);
              commit(Number(e.target.value));
            }}
            onBlur={() => setDraft(null)}
          />
          <span className="text-slate-400">g</span>
        </label>
      </div>
      <input
        type="range"
        aria-label="Aceleração própria (escala logarítmica, de 0,1 g a 10⁷ g)"
        className="mt-2 w-full accent-cyan-400"
        min={Math.log10(MIN_ACCEL_G)}
        max={Math.log10(MAX_ACCEL_G)}
        step="any"
        value={Math.log10(accelG)}
        onChange={(e) => {
          setDraft(null);
          commit(Number((10 ** Number(e.target.value)).toPrecision(3)));
        }}
      />
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>0,1 g</span>
        <span>10⁷ g</span>
      </div>
    </div>
  );
}

function ProfileChoice({
  flipEta,
  coastEta,
  onChange,
}: {
  /** Rapidez de pico sem cruzeiro (com os descansos, se houver): acima dela o cruzeiro nunca é atingido. */
  flipEta: number;
  coastEta: number | null;
  onChange: (eta: number | null) => void;
}) {
  const maxCoastEta = flipEta * MAX_COAST_FRACTION;
  const shownEta = coastEta === null ? null : Math.min(coastEta, maxCoastEta);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Perfil da viagem">
        <button type="button" role="radio" aria-checked={coastEta === null} className={optionClass(coastEta === null)} onClick={() => onChange(null)}>
          <div className="text-[13px] font-semibold text-cyan-100">Acelerar e frear</div>
          <div className="text-[11px] leading-snug text-slate-400">Empuxo o tempo todo: gira no meio do caminho.</div>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={coastEta !== null}
          className={optionClass(coastEta !== null)}
          onClick={() => onChange(Math.min(Math.atanh(DEFAULT_COAST_BETA), 0.8 * flipEta))}
        >
          <div className="text-[13px] font-semibold text-cyan-100">Acelerar, cruzar e frear</div>
          <div className="text-[11px] leading-snug text-slate-400">Motor desligado no meio: menos combustível.</div>
        </button>
      </div>
      {shownEta !== null && (
        <label className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Cruzeiro</span>
          <input
            type="range"
            aria-label="Velocidade de cruzeiro (rapidez η)"
            className="min-w-0 flex-1 accent-cyan-400"
            min={Math.min(MIN_COAST_ETA, maxCoastEta)}
            max={maxCoastEta}
            step="any"
            value={shownEta}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span className="font-readout shrink-0 text-right text-slate-100 tabular-nums">
            {formatVelocity(Math.tanh(shownEta), Math.exp(-shownEta) / Math.cosh(shownEta))}
          </span>
        </label>
      )}
    </div>
  );
}

/** Quanto dura o descanso entre queimas, em vezes a queima (com piloto humano e descansos). */
function RestChoice({ ratio, onChange }: { ratio: number; onChange: (ratio: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-2" role="radiogroup" aria-label="Descanso entre queimas">
        <span className="text-[11px] text-slate-400">Descanso</span>
        {REST_RATIOS.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={ratio === r} className={optionClass(ratio === r)} onClick={() => onChange(r)}>
            <span className="text-[13px] font-semibold text-cyan-100">{r}× a queima</span>
          </button>
        ))}
      </div>
      <div className="text-[11px] leading-snug text-slate-400">
        Sem peso, o corpo se recupera mais devagar do que se desgasta: 5× dá mais folga e alonga a viagem.
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1 last:border-b-0">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span className="font-readout text-right text-sm text-slate-100 tabular-nums">{value}</span>
    </div>
  );
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** O veredito do planejamento; `continuousBurnS` é a maior queima contínua sem os descansos. */
function viabilityText(
  choice: MissionChoice,
  a: MissionAssessment,
  profile: MissionProfile,
  continuousBurnS: number,
): { tone: string; text: string } {
  const g = formatAccelG(choice.accelG);
  const protection = lowerFirst(a.endurance.protection);
  if (a.viability === 'hypothetical') {
    return {
      tone: 'border-rose-400/50 bg-rose-950/40 text-rose-100',
      text:
        choice.crew === 'crewed'
          ? `Hipotética: nenhum ser humano sobrevive a ${g}. O simulador mostra o que um piloto veria.`
          : `Hipotética: nenhum material conhecido aguenta ${g}. É a sonda de demonstração, para ver os efeitos em minutos.`,
    };
  }
  if (a.viability === 'over-limit') {
    return {
      tone: 'border-amber-400/50 bg-amber-950/40 text-amber-100',
      text: `Além do limite: são ${formatSpan(a.burnS)} de empuxo contínuo a ${g}, e o limite do corpo (${protection}) é de ${formatSpan(a.endurance.enduranceS)}. A tripulação não chegaria viva.`,
    };
  }
  const tone = 'border-emerald-400/40 bg-emerald-950/30 text-emerald-100';
  const rest = profile.crewRest;
  if (rest) {
    return {
      tone,
      text:
        `Suportável com descansos: sem eles, seriam ${formatSpan(continuousBurnS)} de empuxo contínuo a ${g}, e o limite ` +
        `do corpo (${protection}) é de ${formatSpan(rest.enduranceS)}. O piloto automático divide a aceleração e a ` +
        `frenagem em ${formatProse(rest.burns)} queimas de até ${formatSpan(rest.burnTau)} (90 % do limite), separadas por ` +
        `${formatSpan(rest.restTau)} de inércia (${formatProse(rest.restTau / rest.burnTau)} vezes a queima), sem peso, ` +
        'para a tripulação se recuperar.',
    };
  }
  return {
    tone,
    text:
      choice.crew === 'crewed'
        ? `Suportável: ${formatSpan(a.burnS)} de empuxo contínuo a ${g}, dentro do limite do corpo (${protection}).`
        : `Suportável: a sonda aguenta ${g} contínuos (${protection}).`,
  };
}

const pickChoice = ({ destination, accelG, coastEta, crew, restRatio }: MissionChoice): MissionChoice => ({
  destination,
  accelG,
  coastEta,
  crew,
  restRatio,
});

/**
 * Planejamento da missão, antes da partida: destino, quem vai a bordo,
 * aceleração (com os limites humanos e mecânicos) e perfil da viagem.
 */
export function MissionPlanner() {
  const open = useCockpitUi((s) => s.plannerOpen);
  return open ? <Planner /> : null;
}

function Planner() {
  const [draft, setDraft] = useState<MissionChoice>(() => pickChoice(useFlightStore.getState()));
  const configureMission = useFlightStore((s) => s.configureMission);
  const midFlight = useFlightStore((s) => s.tau > 0 && s.tau < s.profile.tauTotal);
  const closePlanner = useCockpitUi((s) => s.closePlanner);
  // O cruzeiro do slider fica guardado no rascunho; o que vale é o limitado à aceleração escolhida.
  const coastEta = plannedCoastEta(draft.destination, draft.accelG, draft.coastEta, draft.crew, draft.restRatio);
  const profile = useMemo(
    () => missionProfileFor(draft.destination, draft.accelG, coastEta, draft.crew, draft.restRatio),
    [draft.destination, draft.accelG, coastEta, draft.crew, draft.restRatio],
  );
  const flipEta = useMemo(
    () => missionProfileFor(draft.destination, draft.accelG, null, draft.crew, draft.restRatio).etaMax,
    [draft.destination, draft.accelG, draft.crew, draft.restRatio],
  );
  const assessment = assessMission(draft.crew, draft.accelG, profile);
  const continuousBurnS = longestBurnS(destinationMissionProfile(draft.destination, draft.accelG, coastEta));
  const verdict = viabilityText(draft, assessment, profile, continuousBurnS);
  const presets = presetsFor(draft.crew);
  const presetActive = presets.some((p) => p.accelG === draft.accelG);
  const [customOpen, setCustomOpen] = useState(!presetActive);
  const update = (patch: Partial<MissionChoice>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePlanner();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePlanner]);

  const embark = () => {
    configureMission({ ...draft, coastEta });
    closePlanner();
  };

  const chooseCrew = (crew: CrewKind) => {
    if (crew === draft.crew) return;
    // Mantém a aceleração se ela existe na outra lista (a demonstração existe nas duas).
    const same = presetsFor(crew).find((p) => p.accelG === draft.accelG);
    update({ crew, accelG: same ? same.accelG : presetsFor(crew)[0]!.accelG });
    setCustomOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Planejamento da missão"
      className="absolute inset-0 z-40 flex flex-col overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-md select-text"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6 lg:pb-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-[10px] tracking-[0.4em] text-cyan-300/70 uppercase">Viagem interestelar</div>
            <h1 className="font-display glow-text text-xl font-bold tracking-wider text-white sm:text-2xl">
              Planejamento da missão
            </h1>
          </div>
          <div className="flex shrink-0 gap-2 text-xs">
            <a href={APP_HASH.home} className="rounded-md border border-slate-700 px-2 py-1.5 text-slate-300 hover:bg-slate-800">
              ⌂ Início
            </a>
            <button
              type="button"
              onClick={closePlanner}
              className="rounded-md border border-slate-700 px-2 py-1.5 text-slate-300 hover:bg-slate-800"
            >
              ✕ {midFlight ? 'Voltar ao voo' : 'Fechar'}
            </button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr_1.25fr_1fr]">
          <Section step={1} title="Destino">
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Destino">
              {DESTINATION_LIST.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={d.id === draft.destination.id}
                  className={optionClass(d.id === draft.destination.id)}
                  onClick={() => update({ destination: d })}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-semibold text-slate-50">{d.name}</span>
                    <span className="font-readout shrink-0 text-xs text-cyan-200">{formatCompact(d.distanceLy)} anos-luz</span>
                  </div>
                  <div className="text-[11px] leading-snug text-slate-400">
                    <span className="text-slate-300">{KIND_LABEL[d.kind]}</span> · {d.blurb}
                  </div>
                </button>
              ))}
            </div>
          </Section>

          <Section step={2} title="Nave e aceleração">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Quem vai a bordo">
              {CREW_OPTIONS.map((o) => (
                <button
                  key={o.crew}
                  type="button"
                  role="radio"
                  aria-checked={o.crew === draft.crew}
                  className={optionClass(o.crew === draft.crew)}
                  onClick={() => chooseCrew(o.crew)}
                >
                  <div className="text-[14px] font-semibold text-slate-50">
                    <span aria-hidden className="mr-1">
                      {o.icon}
                    </span>
                    {o.label}
                  </div>
                  <div className="text-[11px] leading-snug text-slate-400">{o.text}</div>
                </button>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Aceleração própria α: quanto o corpo (ou a máquina) aguenta depende de por quanto tempo. Com piloto
              humano, quando o empuxo contínuo passaria do limite, a rota alterna queimas e descansos sem peso.
            </div>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Aceleração própria">
              {presets.map((p) => (
                <PresetCard
                  key={p.id}
                  preset={p}
                  destination={draft.destination}
                  coastEta={draft.coastEta}
                  restRatio={draft.restRatio}
                  active={!customOpen && p.accelG === draft.accelG}
                  onSelect={() => {
                    setCustomOpen(false);
                    update({ accelG: p.accelG });
                  }}
                />
              ))}
              <CustomAcceleration
                accelG={draft.accelG}
                active={customOpen || !presetActive}
                onChange={(accelG) => {
                  setCustomOpen(true);
                  update({ accelG });
                }}
              />
            </div>
          </Section>

          <Section step={3} title="Perfil e resumo">
            <ProfileChoice flipEta={flipEta} coastEta={draft.coastEta} onChange={(coastEta) => update({ coastEta })} />
            {profile.crewRest && <RestChoice ratio={draft.restRatio} onChange={(restRatio) => update({ restRatio })} />}
            <div className="hull-panel mt-1 rounded-lg px-3 py-2">
              <SummaryRow label="Destino" value={draft.destination.name} />
              <SummaryRow label="A bordo" value={draft.crew === 'crewed' ? 'Piloto humano' : 'Sonda robótica'} />
              <SummaryRow label="Aceleração α" value={formatAccelG(draft.accelG)} />
              <SummaryRow label="Tempo de bordo" value={formatSpan(profile.tauTotal)} />
              <SummaryRow label="Tempo na Terra" value={formatSpan(profile.tTotal)} />
              {profile.crewRest && (
                <>
                  <SummaryRow label="Queimas" value={`${formatProse(profile.crewRest.burns)} × até ${formatSpan(profile.crewRest.burnTau)}`} />
                  <SummaryRow
                    label="Descanso entre queimas"
                    value={`${formatSpan(profile.crewRest.restTau)} (${formatProse(profile.crewRest.restTau / profile.crewRest.burnTau)}×)`}
                  />
                </>
              )}
              <SummaryRow label="γ máximo" value={formatGamma(profile.gammaMax)} />
              <SummaryRow
                label="Velocidade máxima"
                value={formatVelocity(Math.tanh(profile.etaMax), Math.exp(-profile.etaMax) / profile.gammaMax)}
              />
              <SummaryRow label="Foguete de fótons m₀/m₁" value={formatProse(rocketMassRatio(profile))} />
            </div>
            <p className={`rounded-lg border px-3 py-2 text-[12px] leading-snug ${verdict.tone}`}>{verdict.text}</p>
            <button
              type="button"
              onClick={embark}
              className="font-display hidden rounded-lg border border-cyan-300/70 bg-cyan-400/20 px-4 py-3 text-sm font-bold tracking-[0.25em] text-cyan-50 uppercase shadow-[0_0_24px_rgba(34,211,238,0.25)] hover:bg-cyan-400/35 lg:block"
            >
              Embarcar ›
            </button>
          </Section>
        </div>
      </div>
      {/* No celular, o resumo e o embarque ficam sempre à mão no rodapé. `sticky`, não
          `fixed`: o backdrop-blur do diálogo faria o `fixed` rolar junto com a lista. */}
      <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 items-center justify-between gap-3 border-t border-cyan-400/30 bg-neutral-950/95 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="min-w-0 text-[11px] leading-tight text-slate-300">
          <div className="truncate font-semibold text-slate-50">
            {draft.destination.shortName} · {formatAccelG(draft.accelG)} ·{' '}
            {draft.crew === 'crewed' ? 'piloto humano' : 'sonda robótica'}
          </div>
          <div className="font-readout truncate">
            <ViabilityMark viability={assessment.viability} /> {formatSpan(profile.tauTotal)} a bordo ·{' '}
            {formatSpan(profile.tTotal)} na Terra
          </div>
        </div>
        <button
          type="button"
          onClick={embark}
          className="font-display shrink-0 rounded-lg border border-cyan-300/70 bg-cyan-400/25 px-4 py-2 text-xs font-bold tracking-[0.2em] text-cyan-50 uppercase"
        >
          Embarcar ›
        </button>
      </div>
    </div>
  );
}
