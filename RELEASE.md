# 发布流程

记录本项目的发版步骤，避免每次重新摸索。

## 一、发布新版本（3 步）

```bash
# 1) 改版本号（见下方“需要同步的位置”）
# 2) 提交
git add -A
git commit -m "chore: v1.0.1"

# 3) 打 tag 并推送（tag 必须与 package.json 的 version 一致）
git tag v1.0.1
git push origin main --tags
```

推送 tag 后，GitHub Actions 会自动：

1. `npm ci` 安装依赖
2. `electron-builder --win nsis --publish never` 打包安装包
3. 用 `softprops/action-gh-release` 把 `dist/*.exe`、`*.blockmap`、`latest.yml` 上传到 Release

约 5 分钟出结果，可在 Actions 页查看：
https://github.com/XLoDream/XuanLuo-Gacha-Export-Hub/actions

## 二、版本号需要同步的位置

| 文件 | 位置 |
| --- | --- |
| `package.json` | `"version"`（决定安装包文件名与更新比对） |
| `index.html` | 关于卡片标题右侧的 `.version-pill` |
| `index.html` | 关于卡片名称后的 `.about-version` |

三处必须一致，否则界面显示的版本会和实际安装包不符。

## 三、更新机制

- 安装版启动时由主进程静默检查 `https://github.com/XLoDream/XuanLuo-Gacha-Export-Hub/releases/latest/download/latest.yml`
- 有新版本 → 后台自动下载 → 下载完成弹窗，点「立即重启」即完成覆盖安装
- 关于页的「检查更新」按钮可手动触发检查
- 开发环境（`npm start`）不做检查，直接提示「开发环境不检查更新」

## 四、验证一次更新

1. 从 Release 页下载当前版本安装包并安装
2. 发布高一个版本（如 1.0.2）
3. 打开已安装的应用 → 关于 → 检查更新 → 应提示发现新版本
4. 等待下载完成后重启，版本号应更新

## 五、注意

- 安装包文件名固定为 `XuanLuo-Gacha-Export-Hub-Setup-<version>.exe`（由 `build.win.artifactName` 控制）。不要改成带空格的名字，否则 `latest.yml` 与实际文件不一致会让更新下载 404。
- 本地打包用 `npm run dist`（等价 `--publish never`），不要直接跑 `electron-builder`，否则本地会因缺少 `GH_TOKEN` 失败。
- 未做代码签名，Windows SmartScreen 会提示"未知发布者"，属正常现象。
- 不要把 `publish` 交回 electron-builder 自动发布：它并发创建 Release 会撞 `422 already_exists`，本项目已改为 Action 上传。
