// Pure helpers for the crowd page. The cloud function collects Queue-Times
// waits every 30 minutes and computes the heat server-side; everything here
// is display logic only (labels, comparisons, chart scaling) plus the
// English -> Chinese ride-name map. No heat is ever computed in the client.

// Shanghai Disneyland ride names (Queue-Times English -> display Chinese).
// Unmapped names fall back to the original English.
export const RIDE_ZH = {
  'Challenge Trails at Camp Discovery': '古迹探索营',
  'Junior Explorers Camp': '小探险家营地',
  'Roaring Rapids': '雷鸣山漂流',
  'Soaring Over the Horizon': '翱翔·飞越地平线',
  'Vista Trail at Camp Discovery': '观景步道',
  '“Once Upon a Time” Adventure': '漫游童话时光',
  'Alice in Wonderland Maze': '爱丽丝梦游仙境迷宫',
  'Hunny Pot Spin': '旋转疯蜜罐',
  'Peter Pan’s Flight': '小飞侠天空奇遇',
  'Seven Dwarfs Mine Train': '七个小矮人矿山车',
  'Seven Dwarfs Mine Train Single Rider': '七个小矮人矿山车（单人通道）',
  'The Many Adventures of Winnie the Pooh': '小熊维尼历险记',
  'Voyage to the Crystal Grotto': '晶彩奇航',
  'Become Iron Man at the Marvel Universe': '漫威英雄总部（钢铁侠）',
  'Dumbo the Flying Elephant': '小飞象',
  'Fantasia Carousel': '幻想曲旋转木马',
  'Marvel Universe': '漫威英雄总部',
  'Buzz Lightyear Planet Rescue': '巴斯光年星际营救',
  'Jet Packs': '喷气背包飞行器',
  'Pixar Adventurous Journey': '皮克斯冒险之旅',
  'Space Chat With Stitch': '太空幸会史迪奇',
  'TRON Lightcycle Power Run – Presented by Chevrolet': '创极速光轮',
  'TRON Realm, Chevrolet Digital Challenge': '创界·雪佛兰数字挑战',
  'Rex’s Racer': '抱抱龙冲天赛车',
  'Slinky Dog Spin': '弹簧狗团团转',
  'Woody’s Roundup': '胡迪牛仔嘉年华',
  'Explorer Canoes': '探险家独木舟',
  'Pirates of the Caribbean Battle for the Sunken Treasure': '加勒比海盗——沉落宝藏之战',
  'Shipwreck Shore': '船奇戏水滩',
  "Siren's Revenge": '海妖复仇号',
  'Zootopia Hot Pursuit Single Rider': '疯狂动物城：热力追踪（单人通道）',
  'Zootopia: Hot Pursuit': '疯狂动物城：热力追踪',
};
export function rideZh(name) { return RIDE_ZH[name] || name || ''; }

export function fmtNum(n) {
  if (n == null || !isFinite(Number(n))) return '–';
  return Number(n).toLocaleString('en-US');
}

// Percentage change of cur vs base; null when it cannot be computed
// (missing data or a zero base) so the UI shows '–', never Infinity/NaN.
export function pctChange(cur, base) {
  if (cur == null || base == null || !(Number(base) > 0) || !isFinite(Number(cur))) return null;
  return (Number(cur) - Number(base)) / Number(base) * 100;
}
export function fmtPct(p) {
  if (p == null || !isFinite(p)) return '–';
  return (p >= 0 ? '↑' : '↓') + Math.abs(p).toFixed(1) + '%';
}

// Chart axis: 08:00..21:00 every 30 minutes (27 slots).
export const AXIS_START_MIN = 8 * 60;
export const AXIS_END_MIN = 21 * 60;
export const SLOT_STEP_MIN = 30;
const pad2 = n => String(n).padStart(2, '0');
export function axisSlots() {
  const out = [];
  for (let m = AXIS_START_MIN; m <= AXIS_END_MIN; m += SLOT_STEP_MIN) out.push(pad2(Math.floor(m / 60)) + ':' + pad2(m % 60));
  return out;
}

// points: [{time:'HH:mm', heat}] -> Map of time -> heat.
export function alignSeries(points) {
  const map = new Map();
  for (const p of points || []) if (p && p.time && typeof p.heat === 'number') map.set(p.time, p.heat);
  return map;
}

// Round a chart maximum up to a clean value (1/1.5/2/3/4/5/6/8/10 x 10^k).
export function niceCeil(v) {
  if (!(v > 0) || !isFinite(v)) return 10000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const s = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10;
  return s * p;
}

// Next planned collection slot label ('HH:mm', Asia/Shanghai) after nowMs:
// slots start at :00 and :30, so this is the start of the next slot.
export function nextSlotLabel(nowMs) {
  const s = new Date(nowMs + 8 * 3600 * 1000);
  const hh = s.getUTCHours(), mm = s.getUTCMinutes();
  const total = hh * 60 + (mm < 30 ? 30 : 60);
  return pad2(Math.floor(total / 60) % 24) + ':' + pad2(total % 60);
}

// Minutes between a record's slot start and now (for the stale warning).
export function slotAgeMin(slotMs, nowMs) {
  if (!slotMs) return null;
  return Math.max(0, Math.round((nowMs - slotMs) / 60000));
}
