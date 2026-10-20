/**
 * Textos do estado da tripulação (CLAUDE.md §4.2.9), usados no painel e no
 * console de teto.
 */
import type { CrewStatus } from '../physics/crewRest';
import { formatAccelG, formatSpan } from './format';

/** Cor do aviso: dentro do limite, sob carga, descansando ou em perigo. */
export type CrewTone = 'ok' | 'load' | 'rest' | 'danger';

export interface CrewText {
  /** Rótulo curto: "Sob 10 g", "Descanso". */
  readonly label: string;
  /** O que vem a seguir: "próxima queima em 1,20 dia". */
  readonly detail: string;
  readonly tone: CrewTone;
}

/** A carga em porcentagem do limite do corpo: "64 %". */
export const formatStrain = (strain: number) => `${Math.round(Math.min(strain, 9.99) * 100)} %`;

export function crewText(status: CrewStatus, planG: number): CrewText {
  const until = status.untilChangeS === null ? '' : formatSpan(Math.max(0, status.untilChangeS));
  switch (status.condition) {
    case 'ready':
      return { label: 'Pronta', detail: 'aguardando a partida', tone: 'ok' };
    case 'easy':
      return { label: `Peso de ${formatAccelG(status.accelG)}`, detail: 'suportável sem desgaste', tone: 'ok' };
    case 'thrust':
      return { label: `Sob ${formatAccelG(status.accelG)}`, detail: `motor desliga em ${until}`, tone: 'load' };
    case 'rest':
      return { label: 'Descanso', detail: `próxima queima em ${until}`, tone: 'rest' };
    case 'coast':
      return { label: 'Sem peso', detail: status.strain > 0 ? 'recuperando-se' : 'recuperada', tone: 'rest' };
    case 'over-limit':
      return {
        label: 'Além do limite',
        detail: status.accelG > 0 ? `motor desliga em ${until}` : 'o corpo não aguentou a carga',
        tone: 'danger',
      };
    case 'fields':
      return status.accelG > 0
        ? { label: `Campos internos · ${formatAccelG(status.accelG)}`, detail: 'o peso de sempre a bordo', tone: 'ok' }
        : { label: 'Sem peso', detail: 'motor desligado', tone: 'rest' };
    case 'hypothetical':
      return { label: 'Não sobreviveria', detail: `nenhum ser humano aguenta ${formatAccelG(planG)}`, tone: 'danger' };
    case 'arrived':
      return status.strain > 1
        ? { label: 'Chegada', detail: 'além do limite do corpo', tone: 'danger' }
        : { label: 'Chegada', detail: 'dentro do limite do corpo', tone: 'ok' };
  }
}
