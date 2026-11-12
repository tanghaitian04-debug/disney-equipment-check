/* 排班纯逻辑：名单、岗位对应、模板生成（含大门板标注）。与界面无关，可单测。 */
export const PEOPLE = ['郑思瑜', '马强', '贺坤华', '刘庭旭', '邵成海', '钱佳恩', '闫国豪', '陈军', '刘伟伟', '唐海添', '聂国标', '李东绪', '赵国华', '罗光荣', '张禹', '陈财', '张云翔'];
export const POSITIONS = ['控台', '视频', '观察A', '观察B', '激光X', '激光3', '激光2', '自动化', '台仓1', '台仓2', '特效', '激光观察员'];
export const SLOT_OF = {
  '控台': '控台操作员', '视频': '视频操作员', '观察A': '观察A', '观察B': '观察B',
  '激光X': '激光操作员', '激光3': '激光3', '激光2': '激光观察员',
  '自动化': '自动化', '台仓1': '台仓1', '台仓2': '台仓2', '特效': '特效观察', '激光观察员': '激光观察员',
};
export const SLOTS = ['激光操作员', '观察A', '观察B', '控台操作员', '视频操作员', '激光3', '自动化', '台仓1', '台仓2', '特效观察', '激光观察员'];
export const TEMPLATE = ["%%DATE%%", "\u821e\u53f0\u6280\u5e08\u5de5\u4f5c\u5b89\u6392:", "", "\u3010\u6fc0\u5149\u64cd\u4f5c\u5458\u3011: %%\u6fc0\u5149\u64cd\u4f5c\u5458%%", "\u3010\u89c2\u5bdfA\u3011:%%\u89c2\u5bdfA%%", "\u3010\u89c2\u5bdfB\u3011:%%\u89c2\u5bdfB%%", "\u9884\u8bbe\u5185\u5bb9\uff1a17:00\u524d\u786e\u8ba4\u7687\u5bb6\u5bb4\u4f1a\u5385\u7a97\u5e18\u9884\u8bbe\u5b8c\u6210\uff1b\u9884\u8bbe\uff1a\u6d4b\u8bd5\u6fc0\u5149\u4f4e\u529f\u7387 \u5f00219A B\u7a97\u6237\u3001\u6d4b\u8bd5 \u6c34\u5e55/\u55b7\u6cc9/\u706f\u5149/\u6295\u5f71\uff0c\u88c5\u4e8c\u697c\u6321\u677f\uff0c\u4e5d\u7c73\u5e55\u5e03\uff0c   \u6f14\u51fa\u7ed3\u675f\uff1a\u5173\u95ed219A B\u7a97\u6237\uff0c\u4e8c\u697c\u6321\u677f\uff0c\u4e5d\u7c73\u5e55\u5e03\uff09\u6ce8\u610f\u89c2\u5bdf\u73af\u5883\u706f\u5149\u4ee5\u53cashow lighting\u72b6\u6001  \u68c0\u67e5\u9884\u8bbe\u4e24\u4fa7\u70ae\u697c\u548c\u4e2d\u95f4\u4f4d\u7f6e\u55b7\u82b1\u673a\u7c73\u5947\u8033\u6735", "", "\u3010\u63a7\u53f0\u64cd\u4f5c\u5458\u3011: %%\u63a7\u53f0\u64cd\u4f5c\u5458%%", "\u3010\u89c6\u9891\u64cd\u4f5c\u5458\u3011: %%\u89c6\u9891\u64cd\u4f5c\u5458%%", "\u3010\u6fc0\u51493\u3011: %%\u6fc0\u51493%%", "\u9884\u8bbe\u5de5\u4f5c\u5185\u5bb9\uff1a\u88c5\u6536\u821e\u53f0\u55b7\u82b1\u673a \u88c5\u6536\u821e\u53f0\u56f4\u6321\u5e03\uff08 \u6d4b\u8bd5\u82b1\u56ed\u706f\u4ee5\u53ca\u6fc0\u5149\uff0c\u6ce8\u610f\u89c2\u5bdf\u73af\u5883\u706f\u5149\u4ee5\u53cashow lighting\u72b6\u6001\u3001\u6f14\u51fa\u524d\u540e\u89c2\u5bdf\u6a61\u6811\u679c\u4e0a\u5347\u4e0b\u964d\u72b6\u51b5 \u5347\u964dcenter piece", "", "\u3010\u81ea\u52a8\u5316\u3011: %%\u81ea\u52a8\u5316%%", "  \u3010\u53f0\u4ed31\u3011: %%\u53f0\u4ed31%%", " \u3010\u53f0\u4ed32\u3011: %%\u53f0\u4ed32%%", "\u3010\u7279\u6548\u89c2\u5bdf\u3011:%%\u7279\u6548\u89c2\u5bdf%%", "\u9884\u8bbe\u5de5\u4f5c\u5185\u5bb9\uff1a\u5347\u964d\u706f\u5854 \u6c34\u5e55 C0106 \u7a97\u5e18 \uff0c\u6d4b\u8bd5\u821e\u53f0\u673a\u68b0\u4ee5\u53caLED\u5c4f\u5e55\u5347\u964d\u72b6\u6001\uff0c\u5f00\u5173\u821e\u53f0\u6295\u5f71\u673a\u76d6\u677f \u68c0\u67e5\u4e24\u4fa7\u706f\u5854LED\u7535\u6e90\u72b6\u6001  \u6d4b\u8bd5\u82b1\u56edLED\u706f\u67f1 \u82b1\u8f66\u5927\u9053LED\u72b6\u6001 \u6f14\u51fa\u4e2d\u89c2\u5bdf\u82b1\u56ed\u4ee5\u53ca\u5de1\u6e38\u5927\u9053\u55b7\u82b1\u673a \u70df\u673a\u7279\u6548\u72b6\u6001", "", "\u3010\u6fc0\u5149\u89c2\u5bdf\u5458\u3011\uff1a%%\u6fc0\u5149\u89c2\u5bdf\u5458%%\uff08\u5e26\u5927\u94a5\u5319\u67dc102\u53f7\u4e07\u80fd\u94a5\u5319\u3001\u9884\u8bbe\uff1a\u540e\u573a480\u6d4b\u8bd5&\u5347\u8d77\u3001\u68c0\u67e5205\u3001221\u5c4b\u9876\u6295\u5f71\u673a\u7a7a\u8c03\u3001\u6295\u5f71\u673a\u7a7a\u8c03\u6e7f\u5ea6\uff0c\u7c73\u5947\u5927\u8857\u5c4b\u9876\u68c0\u67e5\u4e0a\u9501\uff1b\u6f14\u51fa\u7ed3\u675f\uff1a\u7c73\u5947\u5927\u8857\u5c4b\u9876\u89e3\u9501\u3001\u964d\u540e\u573a480\u5e73\u53f0\uff09\u6ce8\u610f\u89c2\u5bdf\u73af\u5883\u706f\u5149\u4ee5\u53cashow lighting\u72b6\u6001"];

/* doors: { 人名: { z: 装, s: 收 } } → 人名后的标注 */
export function doorLabel(person, doors = {}) {
  const d = doors[person] || {};
  if (d.z && d.s) return '（装收大门板）';
  if (d.z) return '（装大门板）';
  if (d.s) return '（收大门板）';
  return '';
}

/* assign: { 人名: 岗位 } → { 模板岗位: [带标注的人名...] }（按名单顺序） */
export function slotAssignments(assign, doors = {}) {
  const out = {};
  for (const slot of SLOTS) out[slot] = [];
  for (const person of PEOPLE) {
    const pos = assign[person];
    if (pos && SLOT_OF[pos]) out[SLOT_OF[pos]].push(person + doorLabel(person, doors));
  }
  return out;
}

export function dateLabel(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
  const get = t => Number(parts.find(p => p.type === t).value);
  const y = get('year'), m = get('month'), d = get('day');
  const wd = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { key, label: `${y}年${m}月${d}日 ${wd}` };
}

/* 模板原文：除人名、日期外一字未动；大门板标注按个人勾选追加在人名后 */
export function buildText(dateStr, assign, doors = {}) {
  const by = slotAssignments(assign, doors);
  const n = slot => by[slot].join('、');
  return TEMPLATE.map(line => line === '%%DATE%%' ? dateStr : line.replace(/%%(.+?)%%/g, (_m, slot) => n(slot))).join('\n');
}
