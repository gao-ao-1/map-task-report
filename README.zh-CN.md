# 县域报告地图

全国地图上的报告协作系统。使用 React / Vinext、Cloudflare D1 数据库和 R2 私有附件存储，通过 Sites 部署。源码可以放 GitHub，但需要后端，不能只部署 GitHub Pages。

## 已实现

- 全国→省→市→县逐级地图，县名搜索定位、悬停展示甲方/联系人/电话/负责人/进度。
- 报告台账、新建和编辑、状态筛选、仅查看自己创建的报告、30 秒自动刷新。
- Word `.doc/.docx` 和 PDF 多附件上传，每个附件最大 20 MB，保留旧附件的上传时间和上传人，登录后下载。
- 报告名称在整个团队内唯一。NFKC 统一全半角、移除首尾空格、合并连续空白并忽略英文大小写，数据库唯一索引保证并发提交不会产生重复。
- 使用稳定用户 ID 判断报告归属。管理员管理全部报告及成员；成员可以查看团队报告，只能修改自己创建的报告。电话和附件不进入公开仓库。
- 编辑使用 revision 乐观锁，避免两人同时修改时静默覆盖。部分附件上传失败时保留已保存的报告 ID 和剩余文件，可重试。

## 使用与团队访问

1. 打开已部署的站点并登录。新建站点默认仅所有者可访问，首次登录的所有者初始化为管理员。
2. 点击“新建报告”，选择县域，填写名称、甲方、联系人、负责人及进度，选择 Word/PDF 文件后保存。
3. “团队”页面添加同事的登录邮箱。还必须通过 Sites 的分享设置给同事授予站点访问权；应用成员名单与平台访问权是两层不同的权限。当前默认私有部署并不自动开放给全部成员。
4. 悬停县域看摘要，点击县域固定选择；在报告列表打开详情，下载附件或编辑、追加新版本。

登录由 Sites 的 ChatGPT 登录网关提供，无独立密码。只有可信网关能注入 `oai-authenticated-user-*` 身份头。如果改为自有云服务器，必须替换为服务端验证的会话/OIDC，不可直接信任公网客户端提供的身份头。

## 本地运行（Node.js 22.13+）

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_plain_captain_marvel.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_fuzzy_jack_murdock.sql
npm run dev
```

本地地址以终端输出为准，通常为 `http://127.0.0.1:5173`。点击登录后使用开发账号 `seedy@sites.test`，仅限本机开发。数据库迁移每份仅执行一次；`.wrangler/state` 保存本地数据库及附件，不提交 Git。线上和本地数据完全分开，测试记录不会发布。

## 检查

```powershell
npx tsc --noEmit
npm run build
npm start -- --port 5174
# 另一个终端；测试使用 Python requests 和 playwright，浏览器测试使用本机 Edge
python tests/integration.py
python tests/browser.py
```

集成测试只允许连接脚本内固定的本机地址，在本地数据库生成“集成测试-”和“界面测试-”记录。检查同名并发冲突、规范化去重、读写权限、匿名拒绝、成员移除、编辑冲突、Word/PDF 上传及下载。浏览器检查地图、县域搜索、创建编辑、附件、重名提示、移动端布局。

## 地图数据

`public/geo` 保存 DataV.GeoAtlas 边界；`lib/regions.json` 与 `public/geo/regions.json` 为同一份目录。获取日期：2026-10-28。源地址：`https://geo.datav.aliyun.com/areas_v3/bound/all.json`，边界为 `{adcode}_full.json`。

全国底图包含 34 个省级地区。县级覆盖以源数据为准，并非所有地区都有细分边界；台湾暂无县级目录/边界。没有下级行政区的直管县级市可直接录入报告。数据反映数据源提供的版本，不保证已包含最新行政区划变更。

更新缓存：`python scripts/download-map.py`。修改数据后重新构建并部署。原始边界随项目交付，访问地图不依赖第三方地图接口；字体使用系统字体。

## 部署与备份

`.openai/hosting.json` 保存 Sites 项目标识，绑定 `DB` 与 `BUCKET`。发布时平台应用 `drizzle/` 的迁移并配置数据库及附件存储；源码可独立同步到 GitHub。不要把本地环境、数据库、附件或部署凭据上传仓库。

正式使用后应制定 D1 数据库和 R2 附件的定期备份策略；本版本不含自动备份、全文检索或自动识别报告内容。附件校验为扩展名及基础文件签名校验，不是完整文档解析。
