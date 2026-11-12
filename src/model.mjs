export const KEY='equipment-check-v1';
export const regions=[{id:'garden',name:'花园',ready:true},{id:'outer',name:'外围灯',ready:false},{id:'castle',name:'城堡',ready:false}];
export function dayKey(date=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
export function deviceCode(tower,lamp){if(!Number.isInteger(tower)||tower<1||tower>9||!Number.isInteger(lamp)||lamp<1||lamp>8)throw Error('无效设备');return `7${tower}${String(lamp).padStart(2,'0')}`}
export function addRecord(records,tower,lamp,date=new Date()){return [{id:crypto.randomUUID(),code:deviceCode(tower,lamp),region:'花园',day:dayKey(date),time:date.toISOString()},...records]}
export function csv(records){return '\ufeff日期,设备编号,区域,记录时间\r\n'+records.map(r=>[r.day,r.code,r.region,new Date(r.time).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})].join(',')).join('\r\n')}
export function readRecords(storage){const raw=storage.getItem(KEY);if(!raw)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows)||!rows.every(r=>r&&typeof r.id==='string'&&/^7[1-9]0[1-8]$/.test(r.code)&&/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&!isNaN(Date.parse(r.time))))throw Error('记录数据异常，请先导出备份，勿清除浏览器数据');return rows}
