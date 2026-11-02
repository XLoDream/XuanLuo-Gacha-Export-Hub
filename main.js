const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');

// ---------- 本地数据存储 ----------
// 配置固定放在用户目录（打包后也可写）；json/ 卡池配置从 asar 内读取（只读）
const configDir = () => path.join(app.getPath('userData'), 'userdata');
const builtinDir = () => app.getAppPath(); // asar 内，只读（含 json/ games 配置、icon/ 图标）
const configFile = () => path.join(configDir(), 'app.config.json');
const DEFAULT_SETTINGS = { theme: 'dark' };
const LEGACY_CONFIGS = ['state.json', 'app.json'];

// 账号数据目录：优先用用户配置，默认与配置目录相同
function dataDir() {
  try { return readConfig().settings.dataDir || configDir(); } catch { return configDir(); }
}

// 内置游戏卡池配置（打包后从 asar 读取）
const GAMES = require(path.join(builtinDir(), 'json', 'games.json'));

// 读取应用配置（settings + active）；旧配置首次读取时合并迁移到 app.config.json
function readConfig() {
  try {
    if (fs.existsSync(configFile())) {
      const cfg = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
      return {
        version: 1,
        settings: { ...DEFAULT_SETTINGS, ...(cfg.settings || {}) },
        active: cfg.active || {},
      };
    }
  } catch { /* 配置损坏则按旧配置重建 */ }

  const active = {};
  const settings = {};
  for (const name of LEGACY_CONFIGS) {
    try {
      const old = JSON.parse(fs.readFileSync(path.join(configDir(), name), 'utf8'));
      Object.assign(settings, old.settings || {});
      for (const [game, uid] of Object.entries(old.active || {})) if (uid) active[game] = uid;
    } catch { /* 旧文件不存在或损坏 */ }
  }
  const cfg = { version: 1, settings: { ...DEFAULT_SETTINGS, ...settings }, active };
  writeConfig(cfg);
  for (const name of LEGACY_CONFIGS) {
    try { fs.unlinkSync(path.join(configDir(), name)); } catch { /* 已不存在 */ }
  }
  return cfg;
}

function writeConfig(cfg) {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify({
    version: 1,
    settings: cfg.settings || DEFAULT_SETTINGS,
    active: cfg.active || {},
  }, null, 2));
}

// UIGF v4.1 顶层游戏键
const GAME_BIZ = { genshin: 'hk4e', hsr: 'hkrpg', zzz: 'nap' };

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#10121b',
    icon: path.join(__dirname, 'icon', 'app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
}

// ---------- 窗口控制 ----------
ipcMain.on('win:min', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('win:max', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.on('win:theme', (e, light) => {
  BrowserWindow.fromWebContents(e.sender)?.setBackgroundColor(light ? '#f2f5fb' : '#10121b');
});

// ---------- 本地数据存储 ----------
ipcMain.handle('store:load', () => {
  try {
    const out = { active: {}, accounts: {} };
    out.active = readConfig().active;
    if (!fs.existsSync(dataDir())) return out;
    for (const game of fs.readdirSync(dataDir())) {
      const dir = path.join(dataDir(), game);
      if (!fs.statSync(dir).isDirectory()) continue;
      out.accounts[game] = fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } })
        .filter((a) => a && a.uid);
    }
    return out;
  } catch {
    return null;
  }
});

ipcMain.handle('store:save', (e, data) => {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const cfg = readConfig();
    cfg.active = data.active || {};
    writeConfig(cfg);
    for (const [game, list] of Object.entries(data.accounts || {})) {
      const dir = path.join(dataDir(), game);
      fs.mkdirSync(dir, { recursive: true });
      const keep = new Set();
      for (const acc of list) {
        if (!acc?.uid) continue;
        keep.add(`${acc.uid}.json`);
        fs.writeFileSync(path.join(dir, `${acc.uid}.json`), JSON.stringify(acc));
      }
      // 清理已删除账号对应的文件
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.json') && !keep.has(f)) fs.rmSync(path.join(dir, f));
      }
    }
    return true;
  } catch {
    return false;
  }
});

// ---------- 应用设置 ----------
ipcMain.handle('settings:save', (e, patch) => {
  try {
    const cfg = readConfig();
    cfg.settings = { ...cfg.settings, ...(patch || {}) };
    writeConfig(cfg);
    return true;
  } catch {
    return false;
  }
});
// 启动时需要首屏就拿到主题，使用同步读取避免闪烁
ipcMain.on('settings:getSync', (e) => {
  try { e.returnValue = readConfig().settings; } catch { e.returnValue = { ...DEFAULT_SETTINGS }; }
});

ipcMain.handle('app:dataDir', () => dataDir());
ipcMain.handle('shell:openDataDir', () => shell.openPath(dataDir()));
ipcMain.handle('dialog:pickDir', async () => {
  const res = await dialog.showOpenDialog({
    title: '选择数据目录',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: dataDir(),
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

// ---------- UIGF v4.1 导入 ----------
ipcMain.handle('uigf:import', async (e, game) => {
  const res = await dialog.showOpenDialog({
    title: '选择 UIGF v4.1 数据文件',
    filters: [{ name: 'UIGF JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths.length) return null;

  const file = res.filePaths[0];
  let json;
  try {
    const text = fs.readFileSync(file, 'utf8');
    json = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return { error: '文件不是有效的 JSON' };
  }

  const version = json?.info?.version ?? '';
  if (!String(version).startsWith('v4.1')) {
    return { error: `仅支持 UIGF v4.1，当前文件版本：${version || '未知'}` };
  }

  const biz = GAME_BIZ[game];
  const sections = biz ? json[biz] : null;
  if (!Array.isArray(sections) || sections.length === 0) {
    return { error: '文件中没有对应游戏的数据，请确认选择了正确的游戏' };
  }

  return {
    ok: true,
    file,
    uids: sections.map((s) => ({ uid: String(s.uid || ''), list: Array.isArray(s.list) ? s.list : [] })),
  };
});

// ---------- 原神：在线获取 ----------
const GENSHIN_TYPES = GAMES.genshin.fetchTypes;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 单次请求（15s 超时），不重试；重试由 fetchPage 统一控制
async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// 参考 genshin-wish-export：任何失败（限流/网络）统一睡 5s 重试同页，最多 5 次
async function fetchPage(api, retryCount = 5) {
  try {
    const json = await fetchJson(api);
    if (json.retcode !== 0) {
      if (json.message === 'authkey timeout') return { authTimeout: true };
      throw new Error(json.message || 'unknown error'); // 限流等统一走重试
    }
    return json;
  } catch (err) {
    if (retryCount > 0) {
      await sleep(5000);
      return fetchPage(api, retryCount - 1);
    }
    throw err;
  }
}

// authkey 含未编码的 = 时需要转义
function fixAuthkey(url) {
  const m = url.match(/authkey=([^&]+)/);
  if (m && m[1].includes('=') && !m[1].includes('%')) {
    return url.replace(/authkey=([^&]+)/, `authkey=${encodeURIComponent(m[1])}`);
  }
  return url;
}

// 从游戏日志定位缓存目录，提取祈愿链接
let lastCacheDir = null;
function readGenshinUrl() {
  const home = app.getPath('home');
  const logFiles = ['原神', 'Genshin Impact']
    .map((n) => path.join(home, 'AppData', 'LocalLow', 'miHoYo', n, 'output_log.txt'))
    .filter((f) => fs.existsSync(f));
  if (!logFiles.length) return { error: '未找到原神日志文件，请先运行一次游戏' };

  for (const logFile of logFiles) {
    const m = fs.readFileSync(logFile, 'utf8').match(/\w:\/.+(GenshinImpact_Data|YuanShen_Data)/);
    if (!m) continue;
    const webCaches = path.join(m[0], 'webCaches');
    const candidates = [];
    const push = (f) => { try { if (fs.existsSync(f)) candidates.push(f); } catch {} };
    push(path.join(webCaches, 'Cache', 'Cache_Data', 'data_2'));
    try {
      fs.readdirSync(webCaches).forEach((sub) => push(path.join(webCaches, sub, 'Cache', 'Cache_Data', 'data_2')));
    } catch {}
    candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const file of candidates) {
      const urls = fs.readFileSync(file, 'utf8')
        .match(/https.+?auth_appid=webview_gacha.+?authkey=.+?game_biz=hk4e_\w+/g);
      if (urls && urls.length) {
        lastCacheDir = path.dirname(path.dirname(file)); // …/webCaches/{版本/}Cache
        return { url: urls[urls.length - 1] };
      }
    }
  }
  // 即使没找到链接，也尽量定位缓存目录（供「打开缓存目录」排查）
  return { error: '缓存中未找到祈愿链接，请先在游戏内打开一次「历史记录」页面' };
}

// 复制祈愿链接 / 打开缓存目录
ipcMain.handle('genshin:copyUrl', () => {
  const found = readGenshinUrl();
  if (found.error) return { error: found.error };
  clipboard.writeText(fixAuthkey(found.url));
  return { ok: true };
});

ipcMain.handle('genshin:openCacheDir', () => {
  readGenshinUrl(); // 尝试刷新 lastCacheDir
  if (!lastCacheDir) return { error: '未找到缓存目录，请先运行一次游戏并打开「历史记录」' };
  shell.openPath(lastCacheDir);
  return { ok: true };
});

// knownLatest: { [uid]: { [gachaType]: 本地最新记录id } }，命中即停止翻页（增量更新）
ipcMain.handle('genshin:fetch', async (e, knownLatest) => {
  const found = readGenshinUrl();
  if (found.error) return { error: found.error };

  const url = new URL(fixAuthkey(found.url));
  const apiDomain = /webstatic-sea|hk4e-api-os|hoyoverse\.com/.test(url.host)
    ? 'https://public-operation-hk4e-sg.hoyoverse.com'
    : 'https://public-operation-hk4e.mihoyo.com';
  if (!url.searchParams.get('authkey')) return { error: '链接中缺少 authkey' };
  ['page', 'size', 'gacha_type', 'end_id'].forEach((k) => url.searchParams.delete(k));
  const qs = url.searchParams.toString();

  const byUid = new Map();
  let total = 0;
  for (const [key, label] of GENSHIN_TYPES) {
    let page = 1;
    let endId = '';
    for (;;) {
      if (page % 10 === 0) await sleep(1000); // 每 10 页歇 1s
      const api = `${apiDomain}/gacha_info/api/getGachaLog?${qs}&gacha_type=${key}&page=${page}&size=20${endId ? `&end_id=${endId}` : ''}`;
      let json;
      try {
        json = await fetchPage(api);
      } catch (err) {
        return { error: `获取失败：${err.message}` };
      }
      if (json.authTimeout) return { error: 'authkey 已过期，请重新在游戏内打开「历史记录」后再试' };

      const list = json.data?.list || [];
      if (!list.length) break;
      await sleep(300); // 每页固定 0.3s

      const uid = String(list[0].uid);
      if (!byUid.has(uid)) byUid.set(uid, []);
      const bucket = byUid.get(uid);
      const known = knownLatest?.[uid]?.[key];

      let reached = false;
      const before = bucket.length;
      for (const item of list) {
        if (known && String(item.id) === String(known)) { reached = true; break; }
        bucket.push(item);
      }
      total += bucket.length - before;
      e.sender.send('genshin:progress', { label, page, total });

      if (reached) break;
      endId = list[list.length - 1].id;
      page += 1;
    }
  }

  return { ok: true, uids: [...byUid.entries()].map(([uid, list]) => ({ uid, list })) };
});

// ==================== 崩坏：星穹铁道 ====================

// 从游戏日志（Player.log）定位缓存目录，提取跃迁链接
let lastHsrCacheDir = null;
function readHsrUrl() {
  const home = app.getPath('home');
  const logFiles = [
    path.join(home, 'AppData', 'LocalLow', 'miHoYo', '崩坏：星穹铁道', 'Player.log'),
    path.join(home, 'AppData', 'LocalLow', 'Cognosphere', 'Star Rail', 'Player.log'),
  ].filter((f) => fs.existsSync(f));
  if (!logFiles.length) return { error: '未找到崩铁日志文件（Player.log），请先运行一次游戏' };

  for (const logFile of logFiles) {
    const m = fs.readFileSync(logFile, 'utf8').match(/\w:\/.*?\/StarRail_Data\//i);
    if (!m) continue;
    const webCaches = path.join(m[0].replace(/\//g, path.sep), 'webCaches');
    const candidates = [];
    const push = (f) => { if (fs.existsSync(f)) candidates.push(f); };
    push(path.join(webCaches, 'Cache', 'Cache_Data', 'data_2'));
    try {
      fs.readdirSync(webCaches).forEach((sub) => push(path.join(webCaches, sub, 'Cache', 'Cache_Data', 'data_2')));
    } catch {}
    candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const file of candidates) {
      const urls = fs.readFileSync(file, 'utf8')
        .match(/https[^?]+?\?[^?]+?&auth_appid=webview_gacha&.+?authkey=.+?&game_biz=hkrpg_/g);
      if (urls && urls.length) {
        lastHsrCacheDir = path.dirname(path.dirname(file)); // …/webCaches/{版本/}Cache
        return { url: urls[urls.length - 1] };
      }
    }
  }
  return { error: '缓存中未找到跃迁链接，请先在游戏内打开一次「跃迁记录」页面' };
}

ipcMain.handle('hsr:copyUrl', () => {
  const found = readHsrUrl();
  if (found.error) return { error: found.error };
  clipboard.writeText(fixAuthkey(found.url));
  return { ok: true };
});

ipcMain.handle('hsr:openCacheDir', () => {
  readHsrUrl();
  if (!lastHsrCacheDir) return { error: '未找到缓存目录，请先运行一次游戏并打开「跃迁记录」' };
  shell.openPath(lastHsrCacheDir);
  return { ok: true };
});

// 在线拉取（参考 star-rail-warp-export：0.3s/页、每 10 页歇 1s、失败 5s 重试 5 次）
// 21/22 = 联动跃迁，使用独立接口 getLdGachaLog
const HSR_TYPES = GAMES.hsr.fetchTypes;

ipcMain.handle('hsr:fetch', async (e, knownLatest) => {
  const found = readHsrUrl();
  if (found.error) return { error: found.error };

  const url = new URL(fixAuthkey(found.url));
  const apiDomain = /webstatic-sea|hkrpg-api-os|api-os-takumi|hoyoverse\.com/.test(url.host)
    ? 'https://public-operation-hkrpg-sg.hoyoverse.com'
    : 'https://public-operation-hkrpg.mihoyo.com';
  if (!url.searchParams.get('authkey')) return { error: '链接中缺少 authkey' };
  ['page', 'size', 'gacha_type', 'end_id'].forEach((k) => url.searchParams.delete(k));
  const qs = url.searchParams.toString();

  // 校验链接有效性
  let test;
  try {
    test = await fetchPage(`${apiDomain}/common/hkrpg_gacha_record/api/getGachaLog?${qs}&gacha_type=1&page=1&size=5`);
  } catch (err) {
    return { error: `链接校验失败：${err.message}` };
  }
  if (test.authTimeout) return { error: 'authkey 已过期，请重新在游戏内打开「跃迁记录」后再试' };
  if (test.error) return { error: test.error };

  const byUid = new Map();
  let total = 0;
  for (const [key, label] of HSR_TYPES) {
    const apiPath = ['21', '22'].includes(key) ? 'getLdGachaLog' : 'getGachaLog';
    let page = 1;
    let endId = '';
    for (;;) {
      if (page % 10 === 0) await sleep(1000); // 每 10 页歇 1s
      const api = `${apiDomain}/common/hkrpg_gacha_record/api/${apiPath}?${qs}&gacha_type=${key}&page=${page}&size=20${endId ? `&end_id=${endId}` : ''}`;
      let json;
      try {
        json = await fetchPage(api);
      } catch (err) {
        return { error: `获取失败：${err.message}` };
      }
      if (json.authTimeout) return { error: 'authkey 已过期，请重新在游戏内打开「跃迁记录」后再试' };

      const list = json.data?.list || [];
      if (!list.length) break;
      await sleep(300); // 每页固定 0.3s

      const uid = String(list[0].uid);
      if (!byUid.has(uid)) byUid.set(uid, []);
      const bucket = byUid.get(uid);
      const known = knownLatest?.[uid]?.[key];

      let reached = false;
      const before = bucket.length;
      for (const item of list) {
        if (known && String(item.id) === String(known)) { reached = true; break; }
        bucket.push(item);
      }
      total += bucket.length - before;
      e.sender.send('hsr:progress', { label, page, total });

      if (reached) break;
      endId = list[list.length - 1].id;
      page += 1;
    }
  }

  return { ok: true, uids: [...byUid.entries()].map(([uid, list]) => ({ uid, list })) };
});

// ==================== 绝区零 ====================

// 从游戏日志（Player.log）提取调频链接（参考 zzz-signal-search-export）：
// 1) 日志中直接出现的调频页 URL（…/info 结尾）；2) 定位 ZenlessZoneZero_Data 进 webCaches 兜底
let lastZzzCacheDir = null;
function readZzzUrl() {
  const home = app.getPath('home');
  const vendors = ['miHoYo', 'Cognosphere'];
  const names = ['绝区零', 'ZenlessZoneZero', 'Zenless Zone Zero'];
  const logFiles = [];
  vendors.forEach((v) => names.forEach((n) => {
    logFiles.push(path.join(home, 'AppData', 'LocalLow', v, n, 'Player.log'));
    logFiles.push(path.join(home, 'AppData', 'LocalLow', v, n, 'output_log.txt'));
  }));
  const existing = logFiles.filter((f) => fs.existsSync(f));
  if (!existing.length) return { error: '未找到绝区零日志文件（Player.log），请先运行一次游戏' };

  for (const logFile of existing) {
    const logText = fs.readFileSync(logFile, 'utf8');
    // 1) 日志里直接记录的调频页 URL
    const direct = logText.match(/https:\/\/[^\s"']+?\/info/g);
    if (direct && direct.length) return { url: direct[direct.length - 1] };
    // 2) 缓存兜底：webCaches{/,/*/}Cache/Cache_Data/data_2
    const m = logText.match(/[A-Z]:[\\/].*?[\\/](?=ZenlessZoneZero_Data)/i);
    if (!m) continue;
    const dataPath = path.join(m[0], 'ZenlessZoneZero_Data');
    const candidates = [];
    const push = (f) => { if (fs.existsSync(f)) candidates.push(f); };
    push(path.join(dataPath, 'webCaches', 'Cache', 'Cache_Data', 'data_2'));
    try {
      fs.readdirSync(path.join(dataPath, 'webCaches')).forEach((sub) =>
        push(path.join(dataPath, 'webCaches', sub, 'Cache', 'Cache_Data', 'data_2')));
    } catch {}
    candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const file of candidates) {
      const urls = fs.readFileSync(file, 'utf8').match(/https.+?authkey=.+?end_id=/g);
      if (urls && urls.length) {
        lastZzzCacheDir = path.dirname(path.dirname(file)); // …/webCaches/{版本/}Cache
        return { url: urls[urls.length - 1] };
      }
    }
  }
  return { error: '缓存中未找到调频链接，请先在游戏内打开一次「调频记录」页面' };
}

ipcMain.handle('zzz:copyUrl', () => {
  const found = readZzzUrl();
  if (found.error) return { error: found.error };
  clipboard.writeText(fixAuthkey(found.url));
  return { ok: true };
});

ipcMain.handle('zzz:openCacheDir', () => {
  readZzzUrl();
  if (!lastZzzCacheDir) return { error: '未找到缓存目录，请先运行一次游戏并打开「调频记录」' };
  shell.openPath(lastZzzCacheDir);
  return { ok: true };
});

// 在线拉取（限流策略同原神/崩铁）
// 频段类型（上游 gachaType.json）：2 独家 / 102 独家重映 / 3 音擎 / 103 音擎回响 / 1 常驻 / 5 邦布
const ZZZ_TYPES = GAMES.zzz.fetchTypes;

async function fetchPageZzz(api, retryCount = 5) {
  try {
    const json = await fetchJson(api);
    if (json.retcode !== 0) {
      if (json.message === 'authkey timeout') return { authTimeout: true };
      if (/param|参数|invalid|gacha_type/i.test(json.message || '')) return { invalid: true };
      throw new Error(json.message || 'unknown error'); // 限流等统一走重试
    }
    return json;
  } catch (err) {
    if (retryCount > 0) {
      await sleep(5000);
      return fetchPageZzz(api, retryCount - 1);
    }
    throw err;
  }
}

ipcMain.handle('zzz:fetch', async (e, knownLatest) => {
  const found = readZzzUrl();
  if (found.error) return { error: found.error };

  const url = new URL(fixAuthkey(found.url));
  const apiDomain = /webstatic-sea|api-os|hoyoverse\.com/.test(url.host)
    ? 'https://public-operation-nap-sg.hoyoverse.com'
    : 'https://public-operation-nap.mihoyo.com';
  if (!url.searchParams.get('authkey')) return { error: '链接中缺少 authkey' };
  ['page', 'size', 'gacha_type', 'real_gacha_type', 'end_id'].forEach((k) => url.searchParams.delete(k));
  const qs = url.searchParams.toString();

  const byUid = new Map();
  let total = 0;
  for (const [key, label] of ZZZ_TYPES) {
    let page = 1;
    let endId = '';
    for (;;) {
      if (page % 10 === 0) await sleep(1000); // 每 10 页歇 1s
      const api = `${apiDomain}/common/gacha_record/api/getGachaLog?${qs}&real_gacha_type=${key}&page=${page}&size=20${endId ? `&end_id=${endId}` : ''}`;
      let json;
      try {
        json = await fetchPageZzz(api);
      } catch (err) {
        return { error: `获取失败：${err.message}` };
      }
      if (json.authTimeout) return { error: 'authkey 已过期，请重新在游戏内打开「调频记录」后再试' };
      if (json.invalid) break; // 该频段类型不存在，跳过

      const list = json.data?.list || [];
      if (!list.length) break;
      await sleep(300); // 每页固定 0.3s

      const uid = String(list[0].uid);
      if (!byUid.has(uid)) byUid.set(uid, []);
      const bucket = byUid.get(uid);
      const known = knownLatest?.[uid]?.[key];

      let reached = false;
      const before = bucket.length;
      for (const item of list) {
        if (known && String(item.id) === String(known)) { reached = true; break; }
        bucket.push(item);
      }
      total += bucket.length - before;
      e.sender.send('zzz:progress', { label, page, total });

      if (reached) break;
      endId = list[list.length - 1].id;
      page += 1;
    }
  }

  return { ok: true, uids: [...byUid.entries()].map(([uid, list]) => ({ uid, list })) };
});

// ==================== 鸣潮 ====================
// 机制与其他游戏不同：链接在游戏日志 Client.log（异或加密）中；API 为 POST 查询，
// 每个卡池一次请求返回全部记录（不分页）；卡池类型 1~13（参考 wuwa-gacha-analyzer）

// 解密 Client.log：字节满足 (b & 0x0F) % 2 == 1 时 XOR 0xA5，否则 XOR 0xEF
function decryptWuwaLog(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    out[i] = ((b & 0x0F) % 2 === 1) ? (b ^ 0xA5) : (b ^ 0xEF);
  }
  return out.toString('utf8');
}

// 取最后一个含 player_id/record_id 的唤取链接（旧链接在前新链接在后）
function extractWuwaLink(text) {
  const found = text.match(/https[^\s"'<>]*\/aki\/gacha\/index\.html#\/record[^\s"'<>]*/g) || [];
  let latest = null;
  for (const u of found) {
    const clean = u.replace(/[,，;；]+$/, '').trim();
    if (clean.includes('player_id=') && clean.includes('record_id=')) latest = clean;
  }
  return latest;
}

// 游戏目录下的日志候选：Client.log 优先，备份日志按修改时间倒序
function wuwaLogCandidates(dir) {
  const logsDir = path.join(dir, 'Client', 'Saved', 'Logs');
  if (!fs.existsSync(logsDir)) return [];
  const out = [];
  const main = path.join(logsDir, 'Client.log');
  if (fs.existsSync(main)) out.push(main);
  try {
    fs.readdirSync(logsDir)
      .filter((f) => /^Client-backup.*\.log$/i.test(f))
      .sort((a, b) => fs.statSync(path.join(logsDir, b)).mtimeMs - fs.statSync(path.join(logsDir, a)).mtimeMs)
      .forEach((f) => out.push(path.join(logsDir, f)));
  } catch {}
  return out;
}

// 从注册表卸载信息找安装路径
function readWuwaRegistry() {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall', '/s', '/f', 'Wuthering', '/d'],
      { windowsHide: true, timeout: 10000 }, (err, stdout) => {
        if (err || !stdout) return resolve('');
        const m = stdout.match(/InstallPath\s+REG_SZ\s+(.+)/i);
        resolve(m ? m[1].trim() : '');
      });
  });
}

// 全盘浅层扫描（整体最多 12 秒、单盘最多深入 40 个分支）
const WUWA_SKIP_DIRS = new Set(['windows', '$recycle.bin', 'system volume information', 'programdata', 'program files', 'program files (x86)', 'node_modules', 'appdata']);
function scanWuwaDir(dir, depth, deadline) {
  if (Date.now() > deadline) return '';
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return ''; }
  const dirs = entries.filter((e) => e.isDirectory() && !WUWA_SKIP_DIRS.has(e.name.toLowerCase()));
  for (const d of dirs) {
    if (/wuthering/i.test(d.name)) {
      const full = path.join(dir, d.name);
      if (fs.existsSync(path.join(full, 'Client', 'Saved', 'Logs'))) return full;
    }
  }
  if (depth <= 1) return '';
  for (let i = 0; i < dirs.length && i < 40; i++) {
    const r = scanWuwaDir(path.join(dir, dirs[i].name), depth - 1, deadline);
    if (r) return r;
  }
  return '';
}
function scanWuwaDrives() {
  const deadline = Date.now() + 12000;
  for (let c = 67; c <= 90; c++) {
    const root = String.fromCharCode(c) + ':\\';
    if (!fs.existsSync(root)) continue;
    const found = scanWuwaDir(root, 2, deadline);
    if (found) return found;
    if (Date.now() > deadline) break;
  }
  return '';
}

let lastWuwaLogDir = null;
async function readWuwaUrl() {
  const dirs = [];
  const push = (d) => { if (d && !dirs.includes(d) && wuwaLogCandidates(d).length) dirs.push(d); };
  push(await readWuwaRegistry());
  ['C:\\Program Files\\Wuthering Waves', 'C:\\Program Files (x86)\\Wuthering Waves',
    'D:\\Wuthering Waves', 'E:\\Wuthering Waves'].forEach(push);
  if (!dirs.length) push(scanWuwaDrives());

  for (const dir of dirs) {
    for (const logFile of wuwaLogCandidates(dir)) {
      const link = extractWuwaLink(decryptWuwaLog(fs.readFileSync(logFile)));
      if (link) { lastWuwaLogDir = path.dirname(logFile); return { url: link }; }
    }
  }
  if (!dirs.length) return { error: '未找到鸣潮游戏目录，请先运行一次游戏' };
  return { error: '日志中未找到唤取链接，请先在游戏内打开一次「唤取记录」页面' };
}

// POST 查询单个卡池（code 0 为成功）
async function fetchJsonPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  return res.json();
}

// 卡池类型（上游 POOL_NAMES）：1/2 活动 3/4 常驻 5-7 新手系 8/9 新旅 10/11 联动 12/13 忆旅
const WUWA_TYPES = GAMES.wuwa.fetchTypes;

ipcMain.handle('wuwa:fetch', async (ev) => {
  const send = (p) => { if (!ev.sender.isDestroyed()) ev.sender.send('wuwa:progress', p); };
  try {
    const found = await readWuwaUrl();
    if (found.error) return { error: found.error };
    const qIdx = found.url.indexOf('?', found.url.indexOf('#'));
    if (qIdx < 0) return { error: '链接格式不正确' };
    const params = new URLSearchParams(found.url.slice(qIdx + 1));
    const playerId = params.get('player_id');
    const recordId = params.get('record_id');
    const cardPoolId = params.get('resources_id');
    const serverId = params.get('svr_id');
    if (!playerId || !recordId || !cardPoolId || !serverId) return { error: '链接参数不完整，请重新打开游戏内唤取记录页' };
    // 优先 svr_area，缺失时按 playerId 规则（1 开头为国际服）
    const area = (params.get('svr_area') || '').toLowerCase();
    const endpoint = (area === 'cn' || (!area && !playerId.startsWith('1')))
      ? 'https://gmserver-api.aki-game2.com/gacha/record/query'
      : 'https://gmserver-api.aki-game2.net/gacha/record/query';
    const languageCode = params.get('lang') || 'zh-Hans';

    const list = [];
    let anySuccess = false;
    let lastErr = '';
    for (const [type, label] of WUWA_TYPES) {
      send({ label, page: 1, total: list.length });
      try {
        const json = await fetchJsonPost(endpoint, {
          playerId, recordId, cardPoolId, cardPoolType: type, serverId, languageCode,
        });
        if (json.code !== 0) throw new Error(json.message || '请求失败');
        // 响应记录里的 cardPoolType 可能是中文名（如"角色精准调谐"），以请求的类型码为准
        (json.data || []).forEach((it) => list.push({ ...it, cardPoolType: type }));
        anySuccess = true;
      } catch (e) { lastErr = e.message; } // 空池或已下架池会失败，跳过
      await sleep(200);
    }
    if (!anySuccess) return { error: `未能获取到数据，链接可能已过期（约 24 小时有效），请重新获取${lastErr ? `（${lastErr}）` : ''}` };
    if (!list.length) return { error: '链接有效但没有唤取记录' };

    // 接口记录无官方 id：按时间升序，对同（时间|名称|池）组编序号生成合成 id
    list.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const seen = new Map();
    list.forEach((it) => {
      const key = `${it.time}|${it.name}|${it.cardPoolType}`;
      const seq = seen.get(key) || 0;
      seen.set(key, seq + 1);
      it.id = `${key}|${seq}`;
    });
    send({ label: '完成', page: 1, total: list.length });
    return { ok: true, uids: [{ uid: playerId, list }] };
  } catch (e) {
    return { error: '读取失败：' + e.message };
  }
});

// 工作表名/卡池列值 → cardPoolType（兼容上游中文名与数字码）
const WUWA_NAME_TO_TYPE = GAMES.wuwa.nameToType;

// Excel 单元格 → 文本（兼容日期对象与富文本）
function xlsxCellText(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('').trim();
  return String(v).trim();
}

// 鸣潮 Excel 导入：工作表名为卡池名，另有数字 UID 工作表；合成 id 规则与在线拉取一致
ipcMain.handle('wuwa:importExcel', async () => {
  const r = await dialog.showOpenDialog({
    filters: [{ name: 'Excel 表格', extensions: ['xlsx'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths.length) return null;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(r.filePaths[0]);
    const list = [];
    let uid = (path.basename(r.filePaths[0]).match(/\d{6,}/) || [])[0] || '';
    wb.eachSheet((ws) => {
      if (/^\d{6,}$/.test(ws.name)) { uid = ws.name; return; } // UID 工作表（勿动提示页）
      // 表头列定位（名称/时间必需，类型/星级/卡池可选）
      const head = {};
      ws.getRow(1).eachCell((cell, col) => { head[xlsxCellText(cell)] = col; });
      if (!head['名称'] || !head['时间']) return;
      const sheetType = WUWA_NAME_TO_TYPE[ws.name];
      ws.eachRow((row, n) => {
        if (n === 1) return;
        const name = xlsxCellText(row.getCell(head['名称']));
        const time = xlsxCellText(row.getCell(head['时间']));
        if (!name || !time) return;
        // 卡池类型：优先卡池列，回退工作表名
        const raw = head['卡池'] ? xlsxCellText(row.getCell(head['卡池'])) : '';
        let type = WUWA_NAME_TO_TYPE[raw] || (/^(?:[1-9]|1[0-3])$/.test(raw) ? raw : '') || sheetType;
        if (!type) return; // 无法归池的行跳过
        list.push({
          time,
          name,
          resourceType: head['类型'] ? xlsxCellText(row.getCell(head['类型'])) : '',
          qualityLevel: head['星级'] ? Number(xlsxCellText(row.getCell(head['星级']))) || 3 : 3,
          cardPoolType: type,
        });
      });
    });
    if (!list.length) return { error: 'Excel 中没有可识别的唤取记录' };
    if (!uid) return { error: '无法识别 UID（文件名或工作表名应为数字 UID）' };
    // 合成 id 与在线拉取同规则：按时间升序，对同（时间|名称|池）组编序号
    list.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const seen = new Map();
    list.forEach((it) => {
      const key = `${it.time}|${it.name}|${it.cardPoolType}`;
      const seq = seen.get(key) || 0;
      seen.set(key, seq + 1);
      it.id = `${key}|${seq}`;
    });
    return { ok: true, uids: [{ uid, list }] };
  } catch (e) {
    return { error: 'Excel 读取失败：' + e.message };
  }
});

ipcMain.handle('wuwa:copyUrl', async () => {
  try {
    const found = await readWuwaUrl();
    if (found.error) return { error: found.error };
    clipboard.writeText(found.url);
    return { ok: true };
  } catch (e) {
    return { error: '读取失败：' + e.message };
  }
});

ipcMain.handle('wuwa:openCacheDir', async () => {
  if (lastWuwaLogDir) { shell.openPath(lastWuwaLogDir); return { ok: true }; }
  const found = await readWuwaUrl();
  if (found.error) return { error: found.error };
  if (lastWuwaLogDir) { shell.openPath(lastWuwaLogDir); return { ok: true }; }
  return { error: '未找到日志目录' };
});

// ---------- GitHub 加速镜像（前缀式代理，按实测延迟排序） ----------
const GH_MIRRORS = [
  'https://gh-proxy.com/',
  'https://gh-proxy.org/',
  'https://gh.monlor.com/',
  'https://ghproxy.imciel.com/',
  'https://cdn.akaere.online/',
  'https://gh.my-website.ccwu.cc/',
  'https://fastgit.cc/',
  'https://github.mxw.qzz.io/',
  'https://gh.acmsz.top/',
  'https://ghproxy.felicity.land/',
  'https://xsadwsd.kdns.fr/',
];
// raw.githubusercontent.com/o/r/ref/path → [直连, 各镜像(github.com/o/r/raw/ref/path)]
function withGhMirrors(rawUrl) {
  const gh = rawUrl
    .replace('https://raw.githubusercontent.com/', 'https://github.com/')
    .replace(/(github\.com\/[^/]+\/[^/]+)\//, '$1/raw/');
  return [rawUrl, ...GH_MIRRORS.map((m) => m + gh)];
}

// ---------- 崩铁物品 ID 表（idJson.json）：启动时自动下载更新并重载 ----------
const HSR_IDMAP_URLS = withGhMirrors(
  'https://raw.githubusercontent.com/biuuu/star-rail-warp-export/refs/heads/main/src/idJson.json');
const hsrIdMapFile = () => path.join(dataDir(), 'hsr-idmap.json');
let hsrIdMap = {}; // { lang: { 名称: id } }
async function updateHsrIdMap() {
  try { hsrIdMap = JSON.parse(fs.readFileSync(hsrIdMapFile(), 'utf8')); } catch { hsrIdMap = {}; }
  for (const url of HSR_IDMAP_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      hsrIdMap = json; // 重载到内存
      fs.writeFileSync(hsrIdMapFile(), JSON.stringify(json));
      console.log('[hsr-idmap] 已从', url, '更新');
      return true;
    } catch {}
  }
  console.warn('[hsr-idmap] 下载失败，使用本地缓存（条数：', Object.keys(hsrIdMap).length, '）');
  return false;
}

// ---------- 绝区零物品 ID 表（idJson.json）：结构与崩铁相同，同样启动时更新 ----------
const ZZZ_IDMAP_URLS = withGhMirrors(
  'https://raw.githubusercontent.com/earthjasonlin/zzz-signal-search-export/refs/heads/main/src/idJson.json');
const zzzIdMapFile = () => path.join(dataDir(), 'zzz-idmap.json');
let zzzIdMap = {};
async function updateZzzIdMap() {
  try { zzzIdMap = JSON.parse(fs.readFileSync(zzzIdMapFile(), 'utf8')); } catch { zzzIdMap = {}; }
  for (const url of ZZZ_IDMAP_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      zzzIdMap = json;
      fs.writeFileSync(zzzIdMapFile(), JSON.stringify(json));
      console.log('[zzz-idmap] 已从', url, '更新');
      return true;
    } catch {}
  }
  console.warn('[zzz-idmap] 下载失败，使用本地缓存（条数：', Object.keys(zzzIdMap).length, '）');
  return false;
}
// ---------- item_id 字典（api.uigf.org，7 天本地缓存） ----------
async function loadItemIdTable() {
  const file = path.join(dataDir(), 'uigf-dict.json');
  try {
    const cache = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - cache.time < 7 * 86400000) return cache.table;
  } catch {}
  try {
    const res = await fetch('https://api.uigf.org/dict/genshin/all.json');
    if (!res.ok) return null;
    const all = await res.json();
    const table = all.chs || all['zh-cn'] || Object.values(all)[0] || {};
    fs.writeFileSync(file, JSON.stringify({ time: Date.now(), table }));
    return table;
  } catch {
    return null;
  }
}

// ---------- UIGF v4.1 导出 ----------
ipcMain.handle('uigf:export', async (e, { game = 'genshin', uid, records }) => {
  // item_id 补全：原神用 UIGF 官方字典，崩铁/绝区零用各自 idJson（启动时已下载）
  let table = null;
  if (game === 'hsr' || game === 'zzz') {
    // idJson 结构为 { 'zh-cn': { id: { name } } }，需反转为 名称 → id
    const src = game === 'hsr' ? hsrIdMap : zzzIdMap;
    const lang = src['zh-cn'] || src.chs || {};
    table = {};
    Object.entries(lang).forEach(([id, v]) => { if (v && v.name) table[v.name] = id; });
    if (!Object.keys(table).length) table = null;
  } else if (game === 'genshin') {
    table = await loadItemIdTable();
  }
  if (table) records.forEach((r) => { r.item_id = table[r.name] ? String(table[r.name]) : ''; });

  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const res = await dialog.showSaveDialog({
    title: '导出 UIGF v4.1',
    defaultPath: `UIGF_v4.1_${uid}_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}.json`,
    filters: [{ name: 'UIGF JSON', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return null;

  const prefix = uid.match(/^(\d{1,2})\d{8}$/)?.[1];
  const tz = prefix === '6' ? -5 : prefix === '7' ? 1 : 8;
  const gameKey = GAME_BIZ[game] || 'hk4e';
  const json = {
    info: {
      uid,
      lang: 'zh-cn',
      export_time: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`,
      export_timestamp: Math.round(Date.now() / 1000),
      export_app: 'XuanLuo Gacha Export Hub',
      export_app_version: app.getVersion(),
      version: 'v4.1',
      region_time_zone: tz,
    },
    [gameKey]: [{ uid, timezone: tz, lang: 'zh-cn', list: records }],
  };
  fs.writeFileSync(res.filePath, JSON.stringify(json, null, 2));
  return { file: res.filePath };
});

// ---------- Excel 导出 ----------
const EXCEL_FILE_NAME = { genshin: '原神祈愿记录', hsr: '崩铁跃迁记录', zzz: '绝区零调频记录', wuwa: '鸣潮唤取记录' };
ipcMain.handle('excel:export', async (e, { game = 'genshin', uid, pools }) => {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const res = await dialog.showSaveDialog({
    title: '导出 Excel',
    defaultPath: path.join(app.getPath('downloads'), `${EXCEL_FILE_NAME[game] || '抽卡记录'}_${uid}_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.xlsx`),
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
  });
  if (res.canceled || !res.filePath) return null;

  const workbook = new ExcelJS.Workbook();
  const rankColor = { 3: 'ff8e8e8e', 4: 'ffa256e1', 5: 'ffbd6932' };
  const thin = { style: 'thin', color: { argb: 'ffc4c2bf' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  for (const pool of pools) {
    if (!pool.list.length) continue;
    const sheet = workbook.addWorksheet(pool.label, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: '时间', key: 'time', width: 20 },
      { header: '名称', key: 'name', width: 16 },
      { header: '类别', key: 'type', width: 8 },
      { header: '星级', key: 'rank', width: 6 },
      { header: '总次数', key: 'total', width: 8 },
      { header: '保底内', key: 'pity', width: 8 },
      { header: '备注', key: 'remark', width: 14 },
    ];
    // 表头样式
    'ABCDEFG'.split('').forEach((c) => {
      const cell = sheet.getCell(`${c}1`);
      cell.border = border;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ffdbd7d3' } };
      cell.font = { color: { argb: 'ff757575' }, bold: true };
    });
    // 数据行：累计总次数 + 保底内计数（出 5★ 清零）
    let total = 0, pity = 0;
    const remarkMap = GAMES[game].remarks || {};
    pool.list.forEach((r) => {
      total += 1; pity += 1;
      const row = { time: r.time, name: r.name, type: r.type, rank: r.rank, total, pity, remark: remarkMap[r.gt] || '' };
      if (r.rank === 5) pity = 0;
      const added = sheet.addRow(row);
      added.eachCell((cell) => {
        cell.border = border;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ffebebeb' } };
        cell.font = { color: { argb: rankColor[r.rank] || 'ff8e8e8e' }, bold: r.rank !== 3 };
      });
    });
  }

  await workbook.xlsx.writeFile(res.filePath);
  return { file: res.filePath };
});

// ---------- 自动更新（GitHub Releases） ----------
let downloadedVersion = null;

function sendUpdateEvent(type, payload = {}) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send('update:event', { type, ...payload });
}

ipcMain.handle('app:checkUpdate', async () => {
  if (!app.isPackaged) return { status: 'dev', current: app.getVersion() };
  try {
    const res = await autoUpdater.checkForUpdates();
    const latest = res?.updateInfo?.version || null;
    return {
      status: 'ok',
      current: app.getVersion(),
      latest,
      downloaded: !!latest && downloadedVersion === latest,
    };
  } catch (e) {
    return { status: 'error', error: e?.message || String(e) };
  }
});

// 只允许 https 外链，交给系统默认浏览器
ipcMain.handle('shell:openExternal', (e, url) => {
  let target;
  try { target = new URL(url); } catch { return { ok: false }; }
  if (target.protocol !== 'https:') return { ok: false };
  return shell.openExternal(target.href).then(() => ({ ok: true })).catch(() => ({ ok: false }));
});

// 静默安装（不显示 NSIS 界面），装完自动重启
ipcMain.on('update:install', () => autoUpdater.quitAndInstall(true, true));

function setupAutoUpdate(win) {
  if (!app.isPackaged) return; // 开发环境无 latest.yml，跳过

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => sendUpdateEvent('available', { version: info.version }));
  autoUpdater.on('download-progress', (p) => sendUpdateEvent('progress', { percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info.version;
    sendUpdateEvent('downloaded', { version: info.version });
  });
  autoUpdater.on('error', (err) => sendUpdateEvent('error', { message: err?.message || String(err) }));

  // 等页面脚本就绪再检查，避免事件早于渲染进程的监听器
  win.webContents.once('did-finish-load', () => {
    autoUpdater.checkForUpdates().catch((e) => sendUpdateEvent('error', { message: e?.message || String(e) }));
  });
}

app.whenReady().then(() => {
  updateHsrIdMap(); // 启动后自动下载更新崩铁物品 ID 表并重载（不阻塞窗口）
  updateZzzIdMap(); // 同上：绝区零物品 ID 表
  createWindow();
  setupAutoUpdate(BrowserWindow.getAllWindows()[0]);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
