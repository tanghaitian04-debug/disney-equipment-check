# 设备故障快速记录系统 V1.0

正式网址：https://check.saka77.cn/

React + TypeScript + Vite。花园 → T1–T9 → 1–8号，成功后自动返回塔选择。外围灯及城堡待补充规则。设备规则位于 src/model.mjs。

功能：上海时间分日、重复编号、最新在上、本机自动保存、单条删除、本次会话撤销新增、历史查看、清空二次确认、复制所选日期和导出全部历史CSV。

## 部署
独立 GitHub Pages，Actions 推送 main 后测试、构建并发布 dist。check.saka77.cn CNAME 指向 tanghaitian04-debug.github.io。GitHub Pages 自定义域名配置为 check.saka77.cn，启用HTTPS。生产访问无需ChatGPT登录，网页无chatgpt.site运行依赖。

本工具从ChatGPT Sites迁移，原因是部分真实访问触发平台安全拦截。未修改game.saka77.cn、主域名或其他项目。旧Sites验证TXT保留作迁移回退，不参与GitHub Pages路由。

## 本机数据
存储键 equipment-check-v1 保持不变；相同 https://check.saka77.cn 来源下更换托管通常保留localStorage。不要清除网站数据。浏览器、设备、域名或协议不同不自动共享数据。Safari 分享 → 添加到主屏幕。请定期导出CSV。

## 开发
Node 22+；npm ci；npm test；npm run build；npm run dev。

## 验证范围
模型测试覆盖7101、7608、7908、非法参数、上海午夜、重复新增、序列化和CSV。云端Chrome网页测试不等同实际iPhone Safari或用户网络验证。
