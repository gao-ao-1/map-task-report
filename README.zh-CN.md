# 县域报告地图

全国地图上的报告协作系统。前端支持 GitHub Pages，后端使用 Cloudflare Workers / Vinext，数据保存在 D1 数据库和 R2 私有文件存储中。

## 访问与登录

- [GitHub 地图页面](https://gao-ao-1.github.io/map-task-report/)
- [后端托管的同款页面](https://county-report-atlas.regaleel259.chatgpt.site/)

两个网址连接同一套云端数据。页面可公开打开，登录、注册都使用本系统的用户名和密码，不需要 ChatGPT 账号。点击右上角“登录”，已有账号直接登录，新用户点击“立即注册”。登录后不会离开当前地图页面。

- 初始管理员用户名为 `admin`。初始密码通过服务器秘密变量 `INITIAL_ADMIN_PASSWORD` 配置，不提交到公开代码仓库。管理员可以在页面内修改密码，环境变量不会覆盖已修改的密码。
- 用户名为 3–32 位汉字、字母、数字、下划线或短横线，统一全半角并忽略英文大小写后必须唯一。数据库唯一索引保证并发注册也不能重名，`admin` 为保留用户名。
- 密码为 8–128 位，服务端使用独立随机盐和 PBKDF2-SHA256 保存密码散列，不保存明文密码。登录有频率限制。
- 登录有效期为 12 小时；令牌保存在当前浏览器标签页的 sessionStorage 中，数据库仅保存令牌的 SHA-256 摘要。退出、停用账号、修改密码会撤销相应登录。
- 当前实现用户名注册，不含短信验证码。手机号可以作为普通数字用户名，但这不代表验证了手机号归属，也不支持短信登录或短信找回密码。

## 用户和权限

用户可自主注册，注册后的普通成员可以查看团队报告、创建报告以及编辑自己创建的报告。管理员可以编辑全部报告，在“团队”页面查看账号、停用和重新启用成员。停用账号保留该账号已上传的报告及附件。

注册页面传入的角色不会被采纳；只有服务器初始化的 `admin` 是管理员。API 不再信任原先的 `oai-authenticated-user-*` 身份头。既有报告、附件和历史创建人记录保留，老的托管平台身份不会自动成为一个新的用户名。

## 上传的文档放在哪里

| 数据 | 保存位置 | 内容 |
| --- | --- | --- |
| 账号和登录 | 云端 D1 数据库（逻辑绑定 `DB`） | 用户名、密码散列、角色、登录摘要 |
| 报告信息 | 同一 D1 数据库 | 报告名、县域、甲方、联系人、电话、状态、负责人 |
| Word/PDF 原文件 | 云端 R2 私有存储（逻辑绑定 `BUCKET`） | 每个附件使用独立随机 ID 保存原文件 |
| 附件索引 | D1 数据库 | 原文件名、大小、报告 ID、上传人和上传时间 |

线上上传的文件不保存在 GitHub，不依赖上传者电脑继续开机，也不只是存在浏览器缓存中。下载时后端先校验登录及账号状态，再从私有存储读取文件。网站内“报告详情 → 附件”就是查看和下载入口。

每个附件最大 20 MB，支持 `.doc`、`.docx`、`.pdf`，允许一次选择多个文件，按文件逐个上传。旧附件会保留，可作为历史版本查看。校验为扩展名和基本文件签名检查，不是完整文档解析。

本机测试使用 `.wrangler/state/` 模拟数据库和文件存储，**本机测试数据与云端数据完全分开**。数据库和附件都需要独立备份；当前版本没有自动备份任务。

## 地图与报告

- 全国→省→市→县逐级浏览，支持县名搜索定位。悬停县域可查看进行中的任务、甲方和电话，点击可固定选择。
- 未登录时任务数显示“—”，不代表某县没有任务。登录后读取团队数据，30 秒自动刷新。
- 报告名称全团队唯一：NFKC 统一全半角、去首尾空格、合并连续空白并忽略英文大小写。由数据库唯一索引保证并发去重。
- 编辑采用 revision 乐观锁，避免多人编辑时静默覆盖。部分附件上传失败时保留报告 ID 和未完成文件，可重试。
- `public/geo` 和 `lib/regions.json` 使用 DataV.GeoAtlas 数据，获取日期 2026-10-28。全国底图含 34 个省级地区，县级覆盖以数据源为准，台湾暂无县级细分。直管县级市无下级行政区时可以直接录入报告。
- 地图缓存更新命令：`python scripts/download-map.py`。

## 本地运行

需要 Node.js 22.13+。首次运行先安装依赖，在项目根目录创建被 Git 忽略的 `.dev.vars`，填写自己选择的本机管理员密码：

```dotenv
INITIAL_ADMIN_PASSWORD=replace-with-your-local-password
```

然后运行：

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_plain_captain_marvel.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_fuzzy_jack_murdock.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_steady_ogun.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_curved_madrox.sql
Copy-Item .dev.vars dist/server/.dev.vars
npm start -- --port 5174
```

打开 `http://127.0.0.1:5174`，使用 `admin` 和自己在 `.dev.vars` 设置的密码登录。四份迁移每份只应用一次，升级已有本地数据库时只执行尚未应用的新迁移。每次重新构建后，如使用生产构建本机预览，需要重新复制 `.dev.vars`；**正式发布前不可把该文件打包到部署制品**。

## 构建和部署

`npm run build` 构建完整后端站点，部署平台需提供 `DB`、`BUCKET` 和秘密变量 `INITIAL_ADMIN_PASSWORD`。首次 `admin` 登录会以该变量初始化账户，之后不会重置账户密码。

`npm run build:pages` 构建 GitHub Pages 前端，将生成的根目录 `index.html`、`pages-assets/`、`.nojekyll` 与源码一并提交。GitHub Pages 设置使用 **Deploy from a branch → main → / (root)**。

GitHub Pages 只负责前端显示；前端通过 HTTPS 请求云端 API。`static-entry/main.tsx` 配置 API 地址，服务端仅允许本站和 `https://gao-ao-1.github.io` 的跨域请求。更换前端域名时需要同时修改该配置和 API 的来源白名单。后端登录页需允许匿名访问，但报告、文件、团队管理接口都必须经过账号认证。

## 验证

```powershell
npx tsc --noEmit
python tests/integration.py
python tests/browser.py
```

测试需 Python `requests`、`playwright` 和本机 Edge，且本地后端已在 5174 端口启动。测试只操作本机服务，读取本地 `.dev.vars` 的管理员密码，不输出密码或令牌。覆盖注册重名、普通登录、权限、限流、密码修改、报告并发去重和附件上传下载。

`python tests/browser.py --pages` 使用本地路由模拟 GitHub Pages 的跨域环境，还需在工作区父目录启动 5175 静态服务并正确提供 JavaScript MIME 类型。它验证地图页面内直接注册、登录、上传和下载的完整过程。
