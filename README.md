# 设备故障快速记录系统 V1.0

正式网址：https://check.saka77.cn/

React + TypeScript + Vite。花园 → T1–T9 → 1–8号，成功后自动返回塔选择。外围灯及城堡为待配置页面；编号规则位于 src/model.mjs。

按上海时间分日、允许重复编号、最新在上、本机自动保存、单条删除、本次会话撤销新增、历史查看、清空二次确认、复制所选日期、导出全部历史CSV。

## 数据与手机使用
记录仅保存在当前设备、当前浏览器、当前域名，不跨设备同步。清除网站数据或无痕模式可能造成记录丢失。请定期导出CSV。Safari 分享 → 添加到主屏幕。

## 开发
Node 22+：npm ci；npm test；npm run build；npm run dev。

## 独立部署
生产环境通过独立 ChatGPT Sites 项目发布，check.saka77.cn CNAME 指向 custom-domains.chatgpt.site。DNS仅新增check及对应两条TXT，原有主域名和game解析保持不变。

此GitHub仓库保存完整V1.0源码及独立构建校验工作流；push main后自动测试、构建并保留dist构建产物。GitHub提交不会自动发布至Sites，更新正式站需另行通过Sites发布已校验版本。不要为本仓库修改game或主域名DNS。

## 验证
模型测试覆盖7101、7608、7908、非法参数、上海午夜、重复记录、序列化及CSV；浏览器测试连续记录、自动返回、刷新持久化、撤销、删除和导出。实际iPhone Safari需真机验证，未将Chrome测试等同Safari真机测试。
