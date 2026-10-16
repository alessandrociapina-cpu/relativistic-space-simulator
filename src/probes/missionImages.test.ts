import { describe, expect, it } from 'vitest';
import { MISSION_IMAGES, commonsImageUrl, commonsPageUrl } from './missionImages';
import { MISSION_LIST } from './missions';

describe('imagens das missões', () => {
  it('toda missão tem ao menos uma imagem, com legenda e crédito', () => {
    for (const m of MISSION_LIST) {
      const images = MISSION_IMAGES[m.id];
      expect(images.length, m.id).toBeGreaterThan(0);
      for (const image of images) {
        expect(image.title.length, image.file).toBeGreaterThan(0);
        expect(image.caption, image.file).toMatch(/[.»]$/);
        expect(image.credit.length, image.file).toBeGreaterThan(0);
      }
    }
  });

  it('nomes de arquivo do Commons: imagem raster, sem espaços nem repetição', () => {
    const files = Object.values(MISSION_IMAGES).flatMap((list) => list.map((i) => i.file));
    expect(new Set(files).size).toBe(files.length);
    for (const file of files) {
      expect(file).toMatch(/\.(jpe?g|png|gif)$/i);
      expect(file).not.toMatch(/\s|^File:/);
    }
  });

  it('URLs da miniatura e da página codificam o nome', () => {
    expect(commonsImageUrl('Apollo_15_flag,_rover,_LM,_Irwin.jpg', 330)).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/Apollo_15_flag%2C_rover%2C_LM%2C_Irwin.jpg?width=330',
    );
    expect(commonsPageUrl('Pale_Blue_Dot.png')).toBe('https://commons.wikimedia.org/wiki/File:Pale_Blue_Dot.png');
  });
});
