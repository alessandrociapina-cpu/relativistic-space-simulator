/**
 * Tempo do simulador de sondas: dias desde J2000 (JD 2451545,0), a escala dos
 * dados do JPL (TDB). A diferença para o UTC (~1 min) some na tela.
 */
export const J2000_JD = 2451545.0;
const UNIX_EPOCH_JD = 2440587.5;
export const DAY_MS = 86_400_000;
export const DAYS_PER_CENTURY = 36_525;
export const DAYS_PER_YEAR = 365.25;

export const msToDays = (ms: number) => ms / DAY_MS + UNIX_EPOCH_JD - J2000_JD;
export const daysToMs = (days: number) => (days + J2000_JD - UNIX_EPOCH_JD) * DAY_MS;
/** Dias desde J2000 de uma data ISO ("1979-03-05" ou "1979-03-05T12:05Z"). */
export const isoToDays = (iso: string) => msToDays(Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso));

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const liveDateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

/** Milissegundos arredondados ao segundo: 11:38 não pode virar 11:37:59,999. */
const roundedMs = (days: number) => Math.round(daysToMs(days) / 1000) * 1000;

/** "5 de mar. de 1979". */
export const formatDate = (days: number) => dateFormat.format(roundedMs(days));
/** "05/03/1979". */
export const formatShortDate = (days: number) => shortDateFormat.format(roundedMs(days));
/** "5 de mar. de 1979, 12:05 UTC". */
export const formatDateTime = (days: number) => `${formatDate(days)}, ${timeFormat.format(roundedMs(days))} UTC`;
/**
 * O visor da data, ao lado da barra: "05 de mar. de 1979, 12:05 UTC". Com o dia em dois dígitos (e os
 * meses abreviados todos com quatro letras), a largura não muda e a barra não é empurrada.
 */
export const formatLiveDateTime = (days: number) =>
  `${liveDateFormat.format(roundedMs(days))}, ${timeFormat.format(roundedMs(days))} UTC`;
