export const KEY='equipment-check-v1';
export const regions=[{id:'garden',name:'花园',ready:true},{id:'outer',name:'外围灯',ready:true},{id:'castle',name:'城堡',ready:false}];
export const roofs=[
 {name:'219A',roof:'Roof1',codes:['7001','7002','7003','7004','7005','7006']},
 {name:'219B',roof:'Roof7',codes:['7022','7023','7024','7025','7026','7027']},
 {name:'小飞象/提摩太小吃',roof:'Roof2',codes:['7010','7011','7012']},
 {name:'小镇',roof:'Roof3',codes:['7007','7008','7009']},
 {name:'33屋顶',roof:'Roof4',codes:['7013','7014','7015']},
 {name:'医务室',roof:'Roof5',codes:['7016','7017','7018']},
 {name:'12朋友园',roof:'Roof6',codes:['7019','7020','7021']},
];
export function dayKey(date=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
export function deviceCode(tower,lamp){if(!Number.isInteger(tower)||tower<1||tower>9||!Number.isInteger(lamp)||lamp<1||lamp>8)throw Error('无效设备');return `7${tower}${String(lamp).padStart(2,'0')}`}
export function addRecord(records,tower,lamp,date=new Date(),fault='不亮'){if(!['不亮','不受控'].includes(fault))throw Error('无效故障类型');return [{id:crypto.randomUUID(),code:deviceCode(tower,lamp),region:'花园',day:dayKey(date),time:date.toISOString(),fault},...records]}
export function isOuter(r){return r.region==='外围灯'}
export function outerMarked(records,code,day=dayKey()){return records.some(r=>isOuter(r)&&r.code===code&&r.day===day)}
export function toggleOuter(records,code,date=new Date()){
 const config=roofs.find(r=>r.codes.includes(code));if(!config)throw Error('无效外围灯编号');
 const day=dayKey(date);
 if(outerMarked(records,code,day))return records.filter(r=>!(isOuter(r)&&r.code===code&&r.day===day));
 return [{id:crypto.randomUUID(),code,region:'外围灯',roof:config.roof,area:config.name,day,time:date.toISOString()},...records];
}
export function recordText(r){return isOuter(r)?`${r.roof}，${r.code}`:`${r.code}${r.fault?' '+r.fault:''}`}
export function csv(records){return '\ufeff日期,设备编号,区域,记录时间,故障类型,Roof编号,区域名称\r\n'+records.map(r=>[r.day,r.code,r.region,new Date(r.time).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}),r.fault||'',r.roof||'',r.area||''].map(s=>'"'+String(s).replaceAll('"','""')+'"').join(',')).join('\r\n')}
export function readRecords(storage){
 const raw=storage.getItem(KEY);if(!raw)return [];const rows=JSON.parse(raw);
 const valid=r=>{
  if(!r||typeof r.id!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.day)||isNaN(Date.parse(r.time)))return false;
  if(isOuter(r)){const cfg=roofs.find(a=>a.codes.includes(r.code));return !!cfg&&r.roof===cfg.roof&&r.area===cfg.name}
  return /^7[1-9]0[1-8]$/.test(r.code)&&(r.fault===undefined||['不亮','不受控'].includes(r.fault));
 };
 if(!Array.isArray(rows)||!rows.every(valid))throw Error('记录数据异常，请保留浏览器数据并联系维护，不要清空');
 return rows;
}
