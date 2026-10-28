# 县域报告地图

全国县域报告管理系统：地图悬停看任务和甲方信息，支持普通账号登录、自主注册、Word/PDF 上传及报告名称去重。

- [打开 GitHub 地图页面](https://gao-ao-1.github.io/map-task-report/)
- [打开后端托管页面](https://county-report-atlas.regaleel259.chatgpt.site/)
- [中文使用、存储及本地运行说明](./README.zh-CN.md)

两个网址连接同一套云端数据，均使用本系统的用户名和密码，不需要 ChatGPT 登录。管理员用户名为 `admin`，初始密码在服务器秘密变量中配置。普通用户可以自行注册，用户名唯一，管理员可以停用账号。

## 数据与附件

账号、报告、甲方和联系人保存在 **Cloudflare D1 数据库**；Word/PDF 原文件保存在 **Cloudflare R2 私有存储**，经过登录校验后下载。真实数据、密码、令牌和上传附件均不提交到 GitHub。

## 开发

需要 Node.js 22.13+。

```powershell
git clone https://github.com/gao-ao-1/map-task-report.git
cd map-task-report
npm ci
```

按[中文说明](./README.zh-CN.md#本地运行)配置本地管理员密码、应用数据库迁移并启动。`npm run build` 构建完整服务，`npm run build:pages` 构建 GitHub Pages 前端。GitHub Pages 本身不运行数据库和上传服务，页面通过 HTTPS API 连接云端后端。
