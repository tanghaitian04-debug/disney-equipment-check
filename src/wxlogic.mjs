// Pure helpers for the wind-page weather modules. The cloud function shapes
// QWeather responses into {t, p, type} points and alert objects; everything
// user-facing that is *derived* (start time, end time, intensity band) is
// computed here from that API data only — never invented.

// Peak-rate intensity band, CMA-style hourly bands (mm/h): <2.5 small,
// <8 medium, <16 large, otherwise storm. Returns '' when there is no rate.
export function intensityBand(mmh) {
  if (!(mmh > 0)) return '';
  if (mmh < 2.5) return '小';
  if (mmh < 8) return '中';
  if (mmh < 16) return '大';
  return '暴';
}

// points: [{t: ISO time, p: precip mm per 5 minutes, type: 'rain'|'snow'}]
// nowMs: epoch ms "now". Returns null when points is unusable.
export function analyzeRain(points, nowMs) {
  if (!Array.isArray(points) || !points.length) return null;
  const wet = points.map(pt => !!pt && Number(pt.p) > 0);
  const first = wet.indexOf(true);
  if (first === -1) return { hasRain: false, kind: '雨' };
  const last = wet.lastIndexOf(true);
  let maxP = 0, snow = false, rain = false;
  points.forEach((pt, i) => {
    if (!wet[i]) return;
    maxP = Math.max(maxP, Number(pt.p) || 0);
    if (pt.type === 'snow') snow = true; else rain = true;
  });
  const kind = snow && !rain ? '雪' : '雨';
  const mmh = maxP * 12; // peak 5-minute amount -> hourly rate
  const firstT = new Date(points[first].t).getTime();
  const startInMin = Math.max(0, Math.round((firstT - nowMs) / 60000));
  const rainingNow = firstT <= nowMs + 150000; // first wet slot has begun (2.5 min grace)
  const continuesBeyond = last === points.length - 1;
  const endTime = continuesBeyond ? null : new Date(new Date(points[last].t).getTime() + 5 * 60000).toISOString();
  return { hasRain: true, kind, rainingNow, startInMin, endTime, continuesBeyond, maxP, mmh, band: intensityBand(mmh) };
}

export const ALERT_COLORS = {
  blue: { label: '蓝色', hex: '#4da3ff' },
  yellow: { label: '黄色', hex: '#ffd23e' },
  orange: { label: '橙色', hex: '#ff8a3c' },
  red: { label: '红色', hex: '#ff5a52' },
  purple: { label: '紫色', hex: '#c792ea' },
  white: { label: '白色', hex: '#e8ecf4' },
  black: { label: '黑色', hex: '#9aa4b8' },
};
export function alertColor(code) {
  return ALERT_COLORS[String(code || '').toLowerCase()] || { label: '', hex: '#9aa4b8' };
}
