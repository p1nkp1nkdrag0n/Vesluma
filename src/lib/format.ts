export const distanceLabel = (meters: number | null | undefined) => meters == null ? '距离待更新' : meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
export const clockLabel = (at: number) => new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
export const dateLabel = (at: number) => new Date(at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replaceAll('/', '.');
export const stampLabel = (at: number) => `${dateLabel(at)} ${clockLabel(at)}`;
