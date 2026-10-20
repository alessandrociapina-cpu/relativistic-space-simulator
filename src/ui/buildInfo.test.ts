import { describe, expect, it } from 'vitest';
import { APP_BUILD, formatBuildTime } from './buildInfo';

describe('versão do app na abertura', () => {
  it('o build grava o instante e o commit', () => {
    expect(Number.isNaN(Date.parse(APP_BUILD.time))).toBe(false);
    expect(APP_BUILD.commit).toMatch(/^([0-9a-f]{7})?$/);
  });

  it('o instante do build em pt-BR, no fuso de quem vê', () => {
    expect(formatBuildTime('2026-10-20T16:20:00Z', 'UTC')).toBe('20/10/2026, 16:20');
    expect(formatBuildTime('2026-10-20T16:20:00Z', 'America/Sao_Paulo')).toBe('20/10/2026, 13:20');
  });
});
