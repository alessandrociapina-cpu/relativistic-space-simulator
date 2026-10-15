import { useEffect, useRef, useState } from 'react';
import { useFlightStore } from '../store/useFlightStore';
import { useExplainSettings } from '../ui/explainSettings';
import { cardFormula, explainEffect, type EffectId } from '../ui/explanations';
import { TeX } from './TeX';
import { useLiveExplainContext } from './useLiveExplainContext';

/** Tempo real mínimo de cada cartão: a 20x ou 100x os efeitos começam mais rápido do que se lê. */
const MIN_VISIBLE_MS = 6000;

/**
 * Segura cada explicação na tela por pelo menos `MIN_VISIBLE_MS`; se outras
 * chegarem nesse meio-tempo, mostra a mais recente ao fim do prazo. Dispensar
 * (`null`) vale na hora.
 */
function useHeldInsight(insight: EffectId | null): EffectId | null {
  const [shown, setShown] = useState(insight);
  const shownAt = useRef(0);

  useEffect(() => {
    if (insight === shown) return;
    const show = (id: EffectId | null) => {
      shownAt.current = performance.now();
      setShown(id);
    };
    const wait = MIN_VISIBLE_MS - (performance.now() - shownAt.current);
    if (insight === null || shown === null || wait <= 0) {
      show(insight);
      return;
    }
    const timer = setTimeout(() => show(useFlightStore.getState().insight), wait);
    return () => clearTimeout(timer);
  }, [insight, shown]);

  return shown;
}

/** Cartão do modo Explicar: o efeito que acabou de começar, com a fórmula que o resume. */
export function ExplanationCard({ className = '' }: { className?: string }) {
  const enabled = useExplainSettings((s) => s.enabled);
  const panelOpen = useExplainSettings((s) => s.panelOpen);
  const autopilot = useFlightStore((s) => s.mode === 'autopilot');
  const shown = useHeldInsight(useFlightStore((s) => s.insight));
  if (!enabled || !autopilot || panelOpen || shown === null) return null;
  return <InsightCard id={shown} className={className} />;
}

function InsightCard({ id, className }: { id: EffectId; className: string }) {
  const openPanel = useExplainSettings((s) => s.openPanel);
  const showInsight = useFlightStore((s) => s.showInsight);
  const explanation = explainEffect(id, useLiveExplainContext());
  const formula = cardFormula(explanation);

  const showDetails = () => {
    // Abre antes de pausar: a pausa só abre o painel (sem destaque) se ele estiver fechado.
    openPanel(id);
    const s = useFlightStore.getState();
    if (s.playing) s.togglePlay();
  };

  return (
    <aside
      aria-label="Explicação do efeito"
      className={`rounded-md border border-amber-400/40 bg-black/75 px-3 py-2 shadow-lg shadow-black/60 backdrop-blur-sm ${className}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[9px] tracking-widest text-amber-300/80 uppercase">💡 Explicação</div>
          {/* Só o título é anunciado: os números do resto mudam 4 vezes por segundo. */}
          <h2 aria-live="polite" className="text-sm leading-tight font-semibold text-amber-100">
            {explanation.title}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Fechar explicação"
          className="-mt-0.5 -mr-1 shrink-0 px-1 text-slate-400 hover:text-slate-100"
          onClick={() => showInsight(null)}
        >
          ✕
        </button>
      </header>
      <p className="mt-1 text-[13px] leading-snug text-slate-200">{explanation.summary}</p>
      {formula && (
        <div className="mt-1.5 overflow-x-auto overflow-y-hidden text-[13px] text-slate-100">
          <TeX tex={formula.tex} />
        </div>
      )}
      <button
        type="button"
        className="mt-1.5 text-[12px] text-cyan-300 hover:text-cyan-100"
        onClick={showDetails}
      >
        ⏸ Pausar e ver todas as fórmulas
      </button>
    </aside>
  );
}
