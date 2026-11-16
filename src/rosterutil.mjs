// Helpers over the generated weekly roster data (src/rosterdata.mjs).
import { ROSTER } from './rosterdata.mjs';

// Display order for the manager "today's positions" line: console and video
// first, then lasers, automation, stage warehouses, effects, observers, and
// finally the floater (机动). Marks not in this list are appended at the end.
export const POSITION_ORDER = ['控台', '视频', 'X激光', '激光2', '激光3', '自动化', '台仓1', '台仓2', '特效', '观察A', '观察B', '机动'];

// Everyone's position on one day, grouped by position in display order:
// [{ pos, names: [...] }]. OFF days and untaught slots (recorded as 空着 in
// the roster data, per the team's convention) are excluded.
export function positionsForDay(dateKey, roster = ROSTER) {
  const byPos = new Map();
  for (const [name, days] of Object.entries((roster && roster.people) || {})) {
    const d = (days || []).find(x => x && x.date === dateKey);
    if (!d || !d.pos || d.pos === 'OFF' || d.pos === '空着') continue;
    if (!byPos.has(d.pos)) byPos.set(d.pos, []);
    byPos.get(d.pos).push(name);
  }
  const out = [];
  for (const pos of POSITION_ORDER) {
    if (byPos.has(pos)) { out.push({ pos, names: byPos.get(pos) }); byPos.delete(pos); }
  }
  for (const [pos, names] of byPos) out.push({ pos, names });
  return out;
}
