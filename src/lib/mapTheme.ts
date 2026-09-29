export type MapTheme = 'paper' | 'treasure';

export const isMapTheme = (value: unknown): value is MapTheme => value === 'paper' || value === 'treasure';

export const mapThemes = [
  { id: 'paper', name: '纸感地图', description: '浅纸色与轻手绘主干道', texture: '/images/map-paper-texture.png' },
  { id: 'treasure', name: '藏宝图', description: '旧纸纹理与棕色墨线', texture: '/images/map-treasure-texture.png' },
] as const;
