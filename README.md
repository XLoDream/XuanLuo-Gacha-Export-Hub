<div align="center">

# <img src="icon/app.ico" alt="" width="36" height="36" valign="middle"/> XuanLuo Gacha Export Hub

**璇洛抽卡祈愿工具**

一款基于 Electron 的 Windows 桌面应用，支持四游戏抽卡记录管理与导出。

[![Releases](https://img.shields.io/github/v/release/XLoDream/XuanLuo-Gacha-Export-Hub?label=最新版本&style=flat-square)](https://github.com/XLoDream/XuanLuo-Gacha-Export-Hub/releases/latest)
[![License](https://img.shields.io/badge/许可证-禁止商用-important.svg?style=flat-square)](LICENSE)

</div>

---

## 🎮 支持游戏

<p align="center">
  <img src="icon/原神.png" height="56" alt="原神" />
  &nbsp;&nbsp;
  <img src="icon/崩铁.png" height="56" alt="崩坏：星穹铁道" />
  &nbsp;&nbsp;
  <img src="icon/绝区零.webp" height="56" alt="绝区零" />
  &nbsp;&nbsp;
  <img src="icon/鸣潮图标-3.0.png" height="56" alt="鸣潮" />
</p>
<p align="center">
  <b>原神 · 祈愿</b> &nbsp;|&nbsp;
  <b>崩坏：星穹铁道 · 跃迁</b> &nbsp;|&nbsp;
  <b>绝区零 · 调频</b> &nbsp;|&nbsp;
  <b>鸣潮 · 唤取</b>
</p>

---

## ✨ 功能特性

| 模块 | 说明 |
| :--- | :--- |
| 🔗 **自动读取链接** | 从游戏日志 / 本地缓存中自动定位抽卡记录链接，无需手动复制 |
| ⬆️ **增量更新** | 命中本地最新记录即停止翻页，只拉取新增部分；支持定时自动更新 |
| 👥 **多账号管理** | 自动按 UID 分账号存储，可添加备注、下拉切换 |
| 📊 **统计视图** | 卡池统计、保底进度、预计出金抽数、记录筛选（星级 / 类型 / 搜索） |
| 🌟 **五星总览** | 按卡池横向切换展示所有 5★ 物品，含图标与分页 |
| ⚔️ **崩铁配队** | 已有角色/光锥面板，支持命途/属性/星级筛选与命座显示；点击角色查看推荐配队 |
| 📤 **导出格式** | UIGF v4.1 JSON（自动补全 item_id） · Excel 表格（按卡池分工作表，含保底计数、星级配色） |
| 📥 **导入** | UIGF v4.1 JSON 导入；鸣潮支持 Excel 导入；批量备份导入导出 |
| 🌗 **深浅色主题** | 一键切换，各游戏独立主题色 |

---

## 📦 下载安装

前往 [Releases](https://github.com/XLoDream/XuanLuo-Gacha-Export-Hub/releases) 下载：

- **`XuanLuo-Gacha-Export-Hub-MiniSetup.exe`**（~90 KB）：轻量下载器，自动获取最新安装包并安装，推荐首选
- **`XuanLuo-Gacha-Export-Hub-Setup-<版本号>.exe`**（~135 MB）：完整安装包，可选安装目录，自动创建桌面与开始菜单快捷方式

> ⚠️ 未做代码签名，Windows SmartScreen 可能提示"未知发布者"，选择"仍要运行"即可。

---

## 🚀 使用说明

1. **原神 / 崩铁 / 绝区零**：先在游戏内打开一次抽卡「历史记录」页面，然后在本工具对应页面点击「更新数据」
2. **鸣潮**：在游戏内打开一次「唤取记录」页面后点击「更新数据」（链接约 24 小时有效，过期需重新打开记录页）
3. **导入**：支持 UIGF v4.1 JSON 文件导入（鸣潮支持 Excel 导入）
4. **导出**：记录页可导出 UIGF JSON 或 Excel；总览页支持批量导出全部游戏

---

## 💾 数据存储

所有数据仅保存在本地，不会上传：

```
%APPDATA%\gacha-export-hub\userdata\
├── app.config.json      # 应用配置与当前选中账号
├── genshin\ <uid>.json  # 原神账号记录
├── hsr\     <uid>.json  # 崩铁账号记录
├── zzz\     <uid>.json  # 绝区零账号记录
└── wuwa\    <uid>.json  # 鸣潮账号记录
```

数据目录可在「设置 → 数据与存储」中更改。

---

## 🛠️ 从源码构建

环境要求：Node.js 18+

```bash
# 安装依赖
npm install

# 开发模式运行
npm start

# 打包绿色版（免安装文件夹）
npm run pack

# 打包 NSIS 安装包（输出到 dist\）
npm run dist
```

---

## 🧰 技术栈

- **Electron 45** — 桌面应用框架
- **ExcelJS** — Excel 导入导出
- **原生 HTML / CSS / JS** — 无前端框架

---

## ⚖️ 许可证

本软件仅供个人学习与游戏数据备份使用，**禁止用于任何商业用途**。详见 [LICENSE](LICENSE)。
