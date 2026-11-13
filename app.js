/* ============================================================
 * XuanLuo Gacha Export Hub
 * 当前已接入：账号体系（所有游戏）+ 原神 UIGF v4.1 导入
 * 其余游戏导入 / 更新数据 / 导出 待接入
 * ============================================================ */

// ---------- 窗口控制 ----------
document.getElementById('btnMin').addEventListener('click', () => winCtl.min());
document.getElementById('btnMax').addEventListener('click', () => winCtl.max());
document.getElementById('btnClose').addEventListener('click', () => winCtl.close());

// ---------- 游戏配置 ----------
// 游戏卡池配置从 json/games.json 加载（可热更新，无需重新打包）
let GAMES;

const VIEW_TITLES = {
  overview: '总览',
  settings: '设置',
};

let GAME_ORDER = [];

// ---------- 工具 ----------
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const poolOf = (game, key) => GAMES[game].pools.find((p) => p.key === key);
const stars = (r) => `<span class="stars s${r}">${'★'.repeat(r)}</span>`;

// ---------- 深浅色模式（持久化在 userdata/app.config.json 的 settings.theme） ----------
function applyTheme(theme) {
  const light = theme === 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  $('#btnTheme').title = light ? '切换为深色模式' : '切换为浅色模式';
  winCtl.theme(light);
}
function readTheme() {
  try { return api.loadSettingsSync().theme === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}
applyTheme(readTheme());
$('#btnTheme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  api.saveSettings({ theme: next });
});

// 自动更新记录开关
let autoUpdateEnabled = true;
try { autoUpdateEnabled = api.loadSettingsSync().autoUpdate !== false; } catch { autoUpdateEnabled = true; }
function applyAutoUpdate(on) {
  autoUpdateEnabled = on;
  const cb = $('#autoUpdateToggle');
  const txt = $('#autoUpdateText');
  if (cb) cb.checked = on;
  if (txt) txt.textContent = on ? '已开启' : '已关闭';
}
$('#autoUpdateToggle').addEventListener('change', (e) => {
  applyAutoUpdate(e.target.checked);
  api.saveSettings({ autoUpdate: e.target.checked });
  // 立即刷新当前游戏视图的提示
  const active = document.querySelector('.view.active');
  if (active) {
    const g = active.id.slice(5);
    if (GAMES[g]) setAbHint(g);
  }
  toast(e.target.checked ? '已开启自动更新记录' : '已关闭自动更新记录');
});

// 切换视图自动更新开关
let autoUpdateOnSwitchEnabled = true;
try { autoUpdateOnSwitchEnabled = api.loadSettingsSync().autoUpdateOnSwitch !== false; } catch { autoUpdateOnSwitchEnabled = true; }
function applyAutoUpdateOnSwitch(on) {
  autoUpdateOnSwitchEnabled = on;
  const cb = $('#autoUpdateOnSwitchToggle');
  const txt = $('#autoUpdateOnSwitchText');
  if (cb) cb.checked = on;
  if (txt) txt.textContent = on ? '已开启' : '已关闭';
}
$('#autoUpdateOnSwitchToggle').addEventListener('change', (e) => {
  applyAutoUpdateOnSwitch(e.target.checked);
  api.saveSettings({ autoUpdateOnSwitch: e.target.checked });
  toast(e.target.checked ? '已开启切换视图自动更新' : '已关闭切换视图自动更新');
});

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------- 更新弹窗 ----------
let pendingVersion = '';
let pendingSource = '';

function setUpdateState(state, d = {}) {
  const mask = $('#updateMask');
  mask.hidden = false;
  $('#updateIcon').dataset.state = state;
  $('#updateProgress').hidden = true;
  $('#updateSources').hidden = true;
  $('#updateActions').innerHTML = '';

  if (state === 'checking') {
    $('#updateTitle').textContent = '正在检查更新';
    $('#updateDesc').textContent = '正在连接 GitHub Releases…';
    return;
  }
  if (state === 'latest') {
    $('#updateTitle').textContent = '已是最新版本';
    $('#updateDesc').textContent = `当前版本 v${d.version || ''}`;
    $('#updateActions').innerHTML = '<button class="btn-sm primary" data-act="closeUpdate">完成</button>';
    return;
  }
  if (state === 'available') {
    $('#updateTitle').textContent = `发现新版本 v${d.version || ''}`;
    $('#updateDesc').textContent = '选择下载源后开始更新，下载完成将自动重启安装';
    const sources = d.sources || [];
    if (sources.length) {
      $('#updateSources').hidden = false;
      $('#updateSources').innerHTML = sources
        .map((s, i) => `<label class="update-source"><input type="radio" name="updSource" value="${s.index}"${i === 0 ? ' checked' : ''}><span>${s.name}</span></label>`)
        .join('');
    }
    $('#updateActions').innerHTML =
      '<button class="btn-sm primary" data-act="startUpdate">立即更新</button>' +
      '<button class="btn-sm" data-act="closeUpdate">稍后</button>';
    return;
  }
  if (state === 'downloading') {
    $('#updateTitle').textContent = `正在下载 v${d.version || ''}`;
    $('#updateDesc').textContent = d.source
      ? `下载源：${d.source}，完成后将自动重启安装`
      : '正在下载新版本，完成后将自动重启安装';
    $('#updateProgress').hidden = false;
    const pct = Math.max(0, Math.min(100, d.percent || 0));
    $('#updateProgressFill').style.width = `${pct}%`;
    $('#updateProgressText').textContent = `${pct}%`;
    $('#updateActions').innerHTML = '<button class="btn-sm" data-act="closeUpdate">后台下载</button>';
    return;
  }
  if (state === 'downloaded') {
    $('#updateTitle').textContent = `v${d.version || ''} 下载完成`;
    $('#updateDesc').textContent = '正在自动重启并安装，请稍候…';
    $('#updateActions').innerHTML = '<button class="btn-sm" data-act="closeUpdate">关闭</button>';
    return;
  }
  if (state === 'error') {
    $('#updateTitle').textContent = '更新失败';
    $('#updateDesc').textContent = d.message || '请稍后重试';
    $('#updateActions').innerHTML = '<button class="btn-sm" data-act="closeUpdate">关闭</button>';
  }
}

function closeUpdateDialog() {
  $('#updateMask').hidden = true;
}

async function startUpdate() {
  const picked = $('#updateSources input[name="updSource"]:checked');
  const idx = picked ? Number(picked.value) : 0;
  pendingSource = picked ? picked.parentElement.textContent.trim() : '';
  setUpdateState('downloading', { version: pendingVersion, percent: 0, source: pendingSource });
  const r = await api.startUpdate(idx);
  if (!r?.ok) setUpdateState('error', { message: r?.error || '下载失败，请换个下载源重试' });
}

if (api?.onUpdate) {
  api.onUpdate((e) => {
    if (e.type === 'available') {
      pendingVersion = e.version;
      setUpdateState('available', { version: e.version, sources: e.sources });
    } else if (e.type === 'source') {
      pendingSource = e.name || '';
    } else if (e.type === 'progress') {
      if (!$('#updateMask').hidden) {
        setUpdateState('downloading', { version: pendingVersion, percent: e.percent, source: pendingSource });
      }
    } else if (e.type === 'downloaded') {
      pendingVersion = e.version;
      setUpdateState('downloaded', { version: e.version });
    } else if (e.type === 'error') {
      setUpdateState('error', { message: e.message });
    }
  });
}


function cmpRec(a, b) {
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  try { return BigInt(a.id) < BigInt(b.id) ? -1 : 1; } catch { return 0; }
}

const fmtTime = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ---------- 数据存储 ----------
let store = { active: {}, accounts: {} };

// 自动更新：每个游戏上次更新时间（进入视图或执行 fetchOnline 时刷新）
let lastUpdateTime = {};
// 切换视图自动更新的冷却计时（5 分钟内不重复触发）
let lastSwitchFetchTime = {};
// 防止同一游戏并发拉取
let fetching = {};

const accountsOf = (g) => store.accounts[g] || (store.accounts[g] = []);
const activeOf = (g) => accountsOf(g).find((a) => a.uid === store.active[g]) || null;
const save = () => api.saveStore(store);

// 每卡池保底进度：返回 id → 出 5★ 时已垫抽数
function pityMap(acc) {
  const byPool = {};
  acc.records.forEach((r) => (byPool[r.pool] ||= []).push(r));
  const map = new Map();
  Object.values(byPool).forEach((list) => {
    list.sort(cmpRec);
    let n = 0;
    list.forEach((r) => {
      n += 1;
      if (r.rank === 5) { map.set(r.id, n); n = 0; }
    });
  });
  return map;
}

// 逐条已垫数：每卡池内自上个 5★ 起累计垫刀，出 5★ 当条清零
function padMap(acc) {
  const byPool = {};
  acc.records.forEach((r) => (byPool[r.pool] ||= []).push(r));
  const map = new Map();
  Object.values(byPool).forEach((list) => {
    list.sort(cmpRec);
    let n = 0;
    list.forEach((r) => {
      if (r.rank === 5) { map.set(r.id, 0); n = 0; }
      else { n += 1; map.set(r.id, n); }
    });
  });
  return map;
}

// ---------- 顶部主导航 ----------
const navItems = $$('.nav-item');
const indicator = $('#navIndicator');

function moveIndicator() {
  const active = $('.nav-item.active');
  if (!active) return;
  indicator.style.left = `${active.offsetLeft}px`;
  indicator.style.width = `${active.offsetWidth}px`;
}

navItems.forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)));

function switchView(view) {
  navItems.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  $$('.subgroup').forEach((g) => { g.hidden = g.dataset.sub !== view; });
  // 总览/配队 等非游戏视图不需要左侧边栏
  $('.body').classList.toggle('no-sub', ['overview', 'hsr-team'].includes(view));
  $('#subTitle').textContent = VIEW_TITLES[view] || '';
  $('.content').scrollTop = 0;
  moveIndicator();
  // 游戏视图可见后重排轮盘（隐藏时无法测量卡片位置）
  if (viewMode[view] !== undefined) requestAnimationFrame(() => layoutCar(view));
  // 进入游戏视图时开始计时，用于 20 分钟自动更新
  if (GAMES[view]) {
    lastUpdateTime[view] = Date.now();
    // 按需加载该游戏的物品图标映射（其他游戏不加载，节省内存）
    if (FIVE_OVERVIEW_GAMES.includes(view)) loadItemIcons(view);
    // 切换到游戏视图时立即拉取一次最新记录（可在设置中开关，内置 5 分钟冷却）
    if (autoUpdateOnSwitchEnabled) {
      const SWITCH_COOLDOWN = 5 * 60 * 1000;
      if (Date.now() - (lastSwitchFetchTime[view] || 0) >= SWITCH_COOLDOWN) {
        lastSwitchFetchTime[view] = Date.now();
        setTimeout(() => fetchOnline(view), 300);
      }
    }
  }
  // 崩铁·配队：共用崩铁数据，进入时加载图标并渲染已有角色/光锥
  if (view === 'hsr-team') {
    loadItemIcons('hsr');
    renderHsrTeam();
  }
}

window.addEventListener('resize', () => { moveIndicator(); GAME_ORDER.forEach(layoutCar); });

// ---------- 卡池轮盘：同时显示三张，无限循环 ----------
// 首尾各克隆 2 张实现无缝循环；carIdx = 当前居中（三张中间）真实卡片的下标
let carIdx = {};
let carLock = {};

// 把轨道定位到「leftDom 起连续三张」并在轮盘区居中，同时只高亮这三张
function applyCar(track, cards, leftDom) {
  const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
  const padL = parseFloat(getComputedStyle(track).paddingLeft) || 0;
  const groupW = 3 * cards[0].offsetWidth + 2 * gap;
  const sidePad = Math.max(0, (track.parentElement.clientWidth - groupW) / 2);
  const x = cards[leftDom].offsetLeft - padL - sidePad;
  track.style.transform = `translateX(${-x}px)`;
  cards.forEach((c, j) => c.classList.toggle('active', j >= leftDom && j <= leftDom + 2));
}

function layoutCar(game, animate = true) {
  const view = $(`#view-${game}`);
  const track = $('[data-role="poolGrid"]', view);
  const prev = $('[data-role="carPrev"]', view);
  const next = $('[data-role="carNext"]', view);
  const cards = $$('.pool-detail', track);
  const n = cards.filter((c) => !c.classList.contains('clone')).length;
  // 轮盘不可见 / 无卡片时收起箭头
  if (!n || !track.offsetParent) { prev.hidden = next.hidden = true; return; }
  // 不足 4 张：静态居中展示，无需循环
  if (n < 4) {
    prev.hidden = next.hidden = true;
    track.style.justifyContent = 'center';
    track.style.transform = 'translateX(0)';
    cards.forEach((c) => c.classList.add('active'));
    return;
  }
  track.style.justifyContent = 'flex-start';
  prev.hidden = next.hidden = false;
  carIdx[game] = ((carIdx[game] % n) + n) % n;

  if (!animate) track.classList.add('noanim');
  applyCar(track, cards, carIdx[game] + 1);
  if (!animate) { void track.offsetHeight; track.classList.remove('noanim'); }
}

function shiftCar(game, d) {
  if (carLock[game]) return false;
  const view = $(`#view-${game}`);
  const track = $('[data-role="poolGrid"]', view);
  const cards = $$('.pool-detail', track);
  const n = cards.filter((c) => !c.classList.contains('clone')).length;
  if (n < 4) return false;

  const v = carIdx[game] + d;          // 目标（虚拟下标，可为 -1 或 n）
  const jumpTo = v === n ? 0 : v === -1 ? n - 1 : null;
  applyCar(track, cards, v + 1);

  if (jumpTo === null) {
    carIdx[game] = v;
  } else {
    // 滑入克隆区后，动画结束瞬间无感跳回对应真实位置
    carLock[game] = true;
    track.addEventListener('transitionend', function h() {
      track.removeEventListener('transitionend', h);
      carIdx[game] = jumpTo;
      layoutCar(game, false);
      carLock[game] = false;
    });
  }
  return true;
}

// ---------- 左侧子选项：概览 / 具体卡池 ----------
let viewMode = {};
let recFilter = {};
let subRefs = {};
// 五星总览：每个游戏当前选中的卡池 key
let fiveOverviewPool = { genshin: 'char', hsr: 'char', wuwa: 'char' };
// 五星总览分页：每页 2 行 × 7 列 = 14 个
const FIVE_PAGE_SIZE = 14;
let fiveOverviewPage = { genshin: 1, hsr: 1, wuwa: 1 };
const FIVE_OVERVIEW_GAMES = ['genshin', 'hsr', 'wuwa'];
// 崩铁·配队：当前选中的物品类型
let teamTab = '角色';
// 崩铁·配队：筛选条件（命途 / 属性 / 星级，空字符串表示全部）
let teamFilter = { path: '', property: '', star: '' };
// 崩铁·配队：分页（每行 7 个，每页最多 2 行 = 14 个）
const TEAM_PAGE_SIZE = 14;
let teamPage = 1;

// 物品图标：名称 → 资源 ID（角色 / 武器 光锥）
let ysCharMap = {}, ysWeaponMap = {};   // 原神
let srCharMap = {}, srLcMap = {};        // 崩铁
let mcCharMap = {}, mcWeaponMap = {};    // 鸣潮
// 崩铁角色/光锥完整元数据：name → { path, property, star }
let srCharInfo = {}, srLcInfo = {};
// 每个游戏图标映射的加载时间（0 表示未加载）；超过 5 分钟未访问则卸载
const ICON_UNLOAD_MS = 5 * 60 * 1000;
let iconLoadTime = { genshin: 0, hsr: 0, wuwa: 0 };
// 加载中的 Promise，避免并发重复请求；调用方可 await 等待加载完成
let iconLoadPromise = { genshin: null, hsr: null, wuwa: null };

const ICON_RES = {
  genshin: { char: 'res/ys/avatar.json', weapon: 'res/ys/weapon.json', cMap: () => ysCharMap, wMap: () => ysWeaponMap, setC: (m) => ysCharMap = m, setW: (m) => ysWeaponMap = m },
  hsr:     { char: 'res/sr/avatar.json', weapon: 'res/sr/lightCone.json', cMap: () => srCharMap, wMap: () => srLcMap, setC: (m) => srCharMap = m, setW: (m) => srLcMap = m },
  wuwa:    { char: 'res/mc/avatar.json', weapon: 'res/mc/weapon.json', cMap: () => mcCharMap, wMap: () => mcWeaponMap, setC: (m) => mcCharMap = m, setW: (m) => mcWeaponMap = m }
};

async function loadItemIcons(game) {
  const res = ICON_RES[game];
  if (!res) return;
  // 已加载则直接返回
  if (Object.keys(res.cMap()).length && Object.keys(res.wMap()).length) { iconLoadTime[game] = Date.now(); return; }
  // 已有加载中的 Promise，等待其完成
  if (iconLoadPromise[game]) return iconLoadPromise[game];
  iconLoadPromise[game] = (async () => {
    try {
      const [c, w] = await Promise.all([
        fetch(res.char).then((r) => r.json()),
        fetch(res.weapon).then((r) => r.json())
      ]);
      const cm = {}, wm = {};
      for (const it of c) cm[it.name] = it.id;
      for (const it of w) wm[it.name] = it.id;
      res.setC(cm); res.setW(wm);
      // 崩铁额外保存命途/属性/星级元数据，用于配队页筛选
      if (game === 'hsr') {
        const ci = {}, li = {};
        for (const it of c) ci[it.name] = { path: it.path, property: it.property, star: Number(it.star) };
        for (const it of w) li[it.name] = { path: it.path, property: '', star: Number(it.star) };
        srCharInfo = ci; srLcInfo = li;
      }
      iconLoadTime[game] = Date.now();
    } catch (e) {
      console.warn(`加载 ${game} 图标映射失败：`, e);
    } finally {
      iconLoadPromise[game] = null;
    }
  })();
  return iconLoadPromise[game];
}

function unloadItemIcons(game) {
  const res = ICON_RES[game];
  if (!res) return;
  res.setC({}); res.setW({});
  if (game === 'hsr') { srCharInfo = {}; srLcInfo = {}; }
  iconLoadTime[game] = 0;
}

function setupGameSubgroups() {
GAME_ORDER.forEach((game) => {
  const group = $(`.subgroup[data-sub="${game}"]`);
  const label = document.createElement('div');
  label.className = 'sub-label';
  label.textContent = '卡池';
  group.appendChild(label);

  const select = (key) => {
    viewMode[game] = key;
    recFilter[game].page = 1;
    renderGame(game);
  };

  // 概览（固定顶部，显示总记录数）
  const ovBtn = document.createElement('button');
  ovBtn.className = 'sub-item active';
  ovBtn.innerHTML = `<svg class="sub-ico" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg><span class="sub-item-label">概览</span><span class="sub-item-count"></span>`;
  ovBtn.addEventListener('click', () => select('overview'));
  group.appendChild(ovBtn);
  subRefs[game].push({ key: 'overview', btn: ovBtn });

  // 五星总览（原神 / 崩铁 / 鸣潮，固定在概览下方）
  if (FIVE_OVERVIEW_GAMES.includes(game)) {
    const fiveBtn = document.createElement('button');
    fiveBtn.className = 'sub-item';
    fiveBtn.innerHTML = `<svg class="sub-ico" viewBox="0 0 24 24"><path d="M12 2l2.9 6.3L22 9.2l-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 7.1-.9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg><span class="sub-item-label">五星总览</span><span class="sub-item-count"></span>`;
    fiveBtn.addEventListener('click', () => select('fiveOverview'));
    group.appendChild(fiveBtn);
    subRefs[game].push({ key: 'fiveOverview', btn: fiveBtn });
  }

  // 卡池：有数据平铺展示；无数据默认折叠进「无数据（N）」分组，点击展开
  const hasBox = document.createElement('div');
  hasBox.className = 'sub-pools';
  const divider = document.createElement('button');
  divider.className = 'sub-divider';
  divider.innerHTML = `<span class="sub-divider-label">无数据</span><i class="sub-divider-line"></i><svg class="sub-divider-arrow" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>`;
  divider.hidden = true;
  const emptyBox = document.createElement('div');
  emptyBox.className = 'sub-pools collapsed';
  divider.addEventListener('click', () => {
    const collapsed = emptyBox.classList.toggle('collapsed');
    divider.classList.toggle('open', !collapsed);
  });
  group.append(hasBox, divider, emptyBox);

  GAMES[game].pools.forEach((pool) => {
    const btn = document.createElement('button');
    btn.className = 'sub-item';
    btn.innerHTML = `<span class="sub-item-label">${pool.label}</span><span class="sub-item-count"></span>`;
    btn.addEventListener('click', () => select(pool.key));
    hasBox.appendChild(btn);
    subRefs[game].push({ key: pool.key, btn });
  });

  // 记录筛选：星级 + 类型 + 搜索（多层组合）
  const view = $(`#view-${game}`);
  $$('[data-rank]', view).forEach((seg) => {
    seg.addEventListener('click', () => {
      $$('[data-rank]', view).forEach((s) => s.classList.toggle('active', s === seg));
      recFilter[game].rank = Number(seg.dataset.rank);
      recFilter[game].page = 1;
      renderRecords(game);
    });
  });
  // 类型筛选按游戏动态生成（原神：角色/武器；崩铁：角色/光锥……）
  const typeBox = $('[data-role="typeFilter"]', view);
  ['', ...(GAMES[game].types || [])].forEach((t, i) => {
    const seg = document.createElement('button');
    seg.className = `seg${i === 0 ? ' active' : ''}`;
    seg.dataset.type = t;
    seg.textContent = t || '全部';
    seg.addEventListener('click', () => {
      $$('.seg', typeBox).forEach((s) => s.classList.toggle('active', s === seg));
      recFilter[game].type = t;
      recFilter[game].page = 1;
      renderRecords(game);
    });
    typeBox.appendChild(seg);
  });
  $('[data-role="recSearch"]', view).addEventListener('input', (e) => {
    recFilter[game].q = e.target.value.trim().toLowerCase();
    recFilter[game].page = 1;
    renderRecords(game);
  });

  // 分页
  $('[data-role="prevPage"]', view).addEventListener('click', () => {
    if (recFilter[game].page > 1) { recFilter[game].page -= 1; renderRecords(game); }
  });
  $('[data-role="nextPage"]', view).addEventListener('click', () => {
    recFilter[game].page += 1; renderRecords(game); // 越界在 renderRecords 内收敛
  });

  // 卡池轮盘：箭头点击 / 滚轮逐张切换 / 点击侧卡居中
  const grid = $('[data-role="poolGrid"]', view);
  $('[data-role="carPrev"]', view).addEventListener('click', () => shiftCar(game, -1));
  $('[data-role="carNext"]', view).addEventListener('click', () => shiftCar(game, 1));

  let wheelAcc = 0, wheelTs = 0;
  grid.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault(); // 循环无尽头，滚轮完全交给轮盘
    const now = Date.now();
    if (now - wheelTs > 180) wheelAcc = 0;
    wheelTs = now;
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 30) return;
    const d = wheelAcc > 0 ? 1 : -1;
    wheelAcc = 0;
    shiftCar(game, d);
  }, { passive: false });

  // 点击两侧卡片：向对应方向拨一张
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.pool-detail');
    if (!card) return;
    const cards = $$('.pool-detail', grid);
    const n = cards.filter((c) => !c.classList.contains('clone')).length;
    if (n < 4) return;
    const pos = cards.indexOf(card) - (carIdx[game] + 1); // 相对最左可见卡的位置
    if (pos === 0) shiftCar(game, -1);
    else if (pos === 2) shiftCar(game, 1);
  });
});
} // end setupGameSubgroups

$$('.sub-item[data-scroll]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.sub-item[data-scroll]', btn.parentElement).forEach((b) => b.classList.toggle('active', b === btn));
    const target = document.getElementById(btn.dataset.scroll);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// ---------- 卡池详情块（参考 genshin-wish-export 展示方式） ----------
// 每个 5★ 物品一个固定配色（按名字哈希），重复出现便于识别
const NAME_COLORS = [
  '#73c0de', '#fac858', '#ee6666', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc',
  '#2ab7ca', '#8fa8ff', '#ff8b94', '#91cc75', '#d4a265', '#61c8a8', '#ffd166',
];

function nameColor(name) {
  let h = 0;
  for (const ch of String(name)) h = (Math.imul(31, h) + ch.codePointAt(0)) | 0;
  return NAME_COLORS[Math.abs(h) % NAME_COLORS.length];
}

// 星级 × 类型 的配色（5★ 金色系 / 4★ 紫色系 / 3★ 蓝色系）
const RANK_COLORS = {
  5: ['#f6c344', '#e0873c', '#d4682a'],
  4: ['#b98cff', '#8a5cf6', '#7a4de0'],
  3: ['#6ea8ff', '#5470c6', '#4060b0'],
};

function renderPoolGrid(game, acc) {
  const view = $(`#view-${game}`);
  const cfg = GAMES[game];
  const pity = pityMap(acc);
  const pct = (n, total) => `${Math.round((n / total) * 10000) / 100}%`;

  $('[data-role="poolGrid"]', view).innerHTML = cfg.pools.map((p) => {
    const rs = acc.records.filter((r) => r.pool === p.key).sort(cmpRec);
    if (!rs.length) return ''; // 无记录的卡池直接隐藏

    const total = rs.length;
    const countRank = (rank) => rs.filter((r) => r.rank === rank).length;
    const [c5, c4, c3] = [countRank(5), countRank(4), countRank(3)];

    // 已累计 X 抽未出 5★
    let lastIdx = -1;
    rs.forEach((r, i) => { if (r.rank === 5) lastIdx = i; });
    const pityCur = lastIdx === -1 ? total : total - 1 - lastIdx;

    // 分类（稀有度 × 类型）与环形图
    const cats = [];
    [5, 4, 3].forEach((rank) => {
      cfg.types.forEach((t, ti) => {
        const n = rs.filter((r) => r.rank === rank && r.type === t).length;
        if (n) cats.push({ label: `${rank}星${t}`, n, color: RANK_COLORS[rank][ti % RANK_COLORS[rank].length] });
      });
    });

    let acc25 = 0;
    const segs = cats.map((c) => {
      const v = (c.n / total) * 100;
      const o = 25 - acc25; // 从 12 点方向开始
      acc25 += v;
      return `<circle r="15.9155" cx="21" cy="21" fill="transparent" stroke="${c.color}" stroke-width="6" stroke-dasharray="${v.toFixed(2)} ${(100 - v).toFixed(2)}" stroke-dashoffset="${o.toFixed(2)}"></circle>`;
    }).join('');

    // 5★ 历史记录（名字[出货抽数]）
    const fiveList = rs.filter((r) => r.rank === 5);
    const hist = fiveList.map((r) =>
      `<span class="pd-hist-item${r.gt === '400' ? ' wish2' : ''}" style="color:${nameColor(r.name)}" title="${r.time}${r.gt === '400' ? ' · 角色活动祈愿-2' : ''}">${r.name}[${pity.get(r.id) ?? '?'}]</span>`
    ).join('');
    const avg = fiveList.length
      ? Math.round(fiveList.reduce((s, r) => s + (pity.get(r.id) || 0), 0) / fiveList.length * 100) / 100
      : null;

    return `<div class="card pool-detail">
      <div class="pd-title">${p.label}</div>
      <div class="pd-range">${rs[0].time.slice(0, 10)} - ${rs[total - 1].time.slice(0, 10)}</div>
      <div class="pd-main">
        <svg viewBox="0 0 42 42" class="pd-donut">
          <circle class="pd-ring" r="15.9155" cx="21" cy="21"></circle>
          ${segs}
          <text x="21" y="19.5" class="pd-donut-num" text-anchor="middle">${total}</text>
          <text x="21" y="25.5" class="pd-donut-sub" text-anchor="middle">抽</text>
        </svg>
        <div class="pd-legend">
          ${cats.map((c) => `<div class="pd-lg-item"><i style="background:${c.color}"></i>${c.label}<b>${c.n}</b></div>`).join('')}
        </div>
      </div>
      <div class="pd-stats">
        <p class="pd-line">一共 <b>${total}</b> 抽 · 已累计 <b class="pd-hot">${pityCur}</b> 抽未出5★</p>
        <p class="pd-line l5">5★：${c5} [${pct(c5, total)}]</p>
        <p class="pd-line l4">4★：${c4} [${pct(c4, total)}]</p>
        <p class="pd-line l3">3★：${c3} [${pct(c3, total)}]</p>
      </div>
      ${fiveList.length ? `<div class="pd-history">5★历史记录：${hist}</div>
      <div class="pd-avg">5★平均出货次数：<b>${avg}</b></div>` : ''}
    </div>`;
  }).join('');

  // 无缝循环：>=4 张时首尾各克隆 2 张
  const grid = $('[data-role="poolGrid"]', view);
  const cards = $$('.pool-detail', grid);
  if (cards.length >= 4) {
    const n = cards.length;
    const headA = cards[n - 2].cloneNode(true);
    const headB = cards[n - 1].cloneNode(true);
    const tailA = cards[0].cloneNode(true);
    const tailB = cards[1].cloneNode(true);
    [headA, headB, tailA, tailB].forEach((c) => { c.classList.add('clone'); c.setAttribute('aria-hidden', 'true'); });
    grid.prepend(headA, headB);
    grid.append(tailA, tailB);
  }
  layoutCar(game, false);
}

// ---------- 游戏视图渲染 ----------
// 设置账号栏右侧提示：记录数 + 更新时间 + 下次自动更新时间
function setAbHint(game) {
  const view = $(`#view-${game}`);
  const hint = $('[data-role="abHint"]', view);
  if (!hint) return;
  const acc = activeOf(game);
  if (!acc) { hint.textContent = '未导入'; return; }
  let text = `${acc.records.length} 条记录 · 更新于 ${fmtTime(acc.updatedAt)}`;
  if (autoUpdateEnabled) {
    const next = (lastUpdateTime[game] || 0) + 20 * 60 * 1000;
    const d = new Date(next);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    text += ` · 下次自动更新 ${hh}:${mm}`;
  } else {
    text += ' · 自动更新已关闭';
  }
  hint.textContent = text;
}

function renderGame(game) {
  const view = $(`#view-${game}`);
  const acc = activeOf(game);
  const list = accountsOf(game);

  const selBtn = $('[data-role="uidSelectBtn"]', view);
  if (selBtn) {
    const txt = selBtn.querySelector('.usb-text');
    if (acc) {
      txt.textContent = acc.remark ? `${acc.uid} · ${acc.remark}` : acc.uid;
      selBtn.classList.remove('empty');
    } else {
      txt.textContent = '选择账号';
      selBtn.classList.add('empty');
    }
    selBtn.disabled = !list.length;
  }
  const remarkEl = $('[data-role="abRemark"]', view);
  if (remarkEl) {
    const r = acc?.remark || '';
    remarkEl.textContent = r ? '修改备注' : '新增备注';
    remarkEl.classList.toggle('has', !!r);
    remarkEl.title = r ? `当前备注：${r}，点击修改` : '点击添加账号备注';
  }
  setAbHint(game);

  // 卡池按有无数据归位：有数据显示计数、无数据置底灰显禁用；当前池变空时回退「概览」
  const countOf = (k) => (acc ? acc.records.filter((r) => r.pool === k).length : 0);
  const isFiveMode = viewMode[game] === 'fiveOverview';
  if (viewMode[game] !== 'overview' && !isFiveMode && !countOf(viewMode[game])) viewMode[game] = 'overview';
  const group = $(`.subgroup[data-sub="${game}"]`);
  const [hasBox, emptyBox] = group.querySelectorAll('.sub-pools');
  const divider = group.querySelector('.sub-divider');
  let emptyCount = 0;
  subRefs[game].forEach(({ key, btn }) => {
    btn.classList.toggle('active', key === viewMode[game]);
    const countEl = btn.querySelector('.sub-item-count');
    if (key === 'overview') {
      countEl.textContent = acc && acc.records.length ? acc.records.length : '';
      return;
    }
    if (key === 'fiveOverview') {
      const fiveCount = acc ? acc.records.filter((r) => r.rank === 5).length : 0;
      countEl.textContent = fiveCount || '';
      return;
    }
    const n = countOf(key);
    countEl.textContent = n || '';
    btn.disabled = n === 0;
    btn.classList.toggle('empty', n === 0);
    (n ? hasBox : emptyBox).appendChild(btn);
    if (!n) emptyCount++;
  });
  divider.hidden = emptyCount === 0;
  divider.querySelector('.sub-divider-label').textContent = `无数据（${emptyCount}）`;
  const overview = viewMode[game] === 'overview';
  const fiveMode = viewMode[game] === 'fiveOverview';

  $('[data-role="accountEmpty"]', view).hidden = !!acc;
  $('.stat-row', view).style.display = acc && overview ? '' : 'none';
  $('[data-role="poolGrid"]', view).style.display = acc && overview ? '' : 'none';
  $('.records-card', view).style.display = acc && !overview && !fiveMode ? '' : 'none';
  const fiveCard = $('[data-role="fiveOverview"]', view);
  if (fiveCard) fiveCard.style.display = acc && fiveMode ? '' : 'none';
  if (!overview) layoutCar(game); // 非概览模式收起轮盘箭头

  if (!acc) return;

  // 统计
  const recs = acc.records;
  const fives = recs.filter((r) => r.rank === 5);
  // 已垫数：主卡池（配置里第一个，如「角色活动祈愿」）自上个 5★ 起的垫刀
  const mainPool = GAMES[game].pools[0];
  const mainRecs = recs.filter((r) => r.pool === mainPool.key).sort(cmpRec);
  let lastIdx = -1;
  mainRecs.forEach((r, i) => { if (r.rank === 5) lastIdx = i; });
  const mainPad = lastIdx === -1 ? mainRecs.length : mainRecs.length - 1 - lastIdx;
  $('.stat-row', view).innerHTML = `
    <div class="stat-card"><span>总抽数</span><b>${recs.length}</b></div>
    <div class="stat-card"><span>5★ 数量</span><b class="r5">${fives.length}</b></div>
    <div class="stat-card"><span>${mainPool.label} · 已垫</span><b class="accent">${mainPad}</b></div>
    <div class="stat-card"><span>平均出金</span><b>${fives.length ? (recs.length / fives.length).toFixed(1) : '—'}</b></div>
  `;

  if (overview) renderPoolGrid(game, acc);       // 概览：卡池详情块
  else if (fiveMode) { if (FIVE_OVERVIEW_GAMES.includes(game)) renderFiveOverview(game, acc); } // 五星总览
  else renderRecords(game);                       // 具体卡池：记录表
}

// ---------- 五星总览（原神 / 崩铁 / 鸣潮） ----------
// 物品图标路径：按游戏与类型选择资源目录与扩展名
function itemIcon(game, name, type) {
  let id, sub, ext;
  if (game === 'genshin') {
    id = type === '角色' ? ysCharMap[name] : ysWeaponMap[name];
    sub = type === '角色' ? 'avatar' : 'weapon'; ext = 'webp';
  } else if (game === 'hsr') {
    id = type === '角色' ? srCharMap[name] : srLcMap[name];
    sub = type === '角色' ? 'avatar' : 'lightCone'; ext = 'webp';
  } else if (game === 'wuwa') {
    id = type === '角色' ? mcCharMap[name] : mcWeaponMap[name];
    sub = type === '角色' ? 'avatar' : 'weapon'; ext = 'png';
  }
  if (!id) return '';
  const base = game === 'genshin' ? 'ys' : game === 'hsr' ? 'sr' : 'mc';
  return `res/${base}/ui/${sub}/${id}.${ext}`;
}

function renderFiveOverview(game, acc) {
  const view = $(`#view-${game}`);
  const tabsBox = $('[data-role="fiveTabs"]', view);
  const card = $('[data-role="fiveOverview"]', view);
  const grid = $('[data-role="fiveGrid"]', view);
  const empty = $('[data-role="fiveEmpty"]', view);
  const countChip = $('[data-role="fivePoolCount"]', view);

  // 确保当前游戏的图标映射已加载（可能因 5 分钟未访问被卸载）
  loadItemIcons(game);

  if (!acc) {
    tabsBox.innerHTML = '';
    grid.innerHTML = '';
    empty.hidden = false;
    countChip.textContent = '0 个 5★';
    const p = card.querySelector('.five-pager'); if (p) p.remove();
    return;
  }

  // 仅保留有 5★ 记录的卡池，重建横向标签
  const poolsWithFive = GAMES[game].pools.filter((p) =>
    acc.records.some((r) => r.pool === p.key && r.rank === 5)
  );

  // 当前选中的卡池若无 5★，回退到第一个有数据的卡池
  if (!poolsWithFive.some((p) => p.key === fiveOverviewPool[game])) {
    fiveOverviewPool[game] = poolsWithFive[0]?.key || GAMES[game].pools[0].key;
    fiveOverviewPage[game] = 1;
  }

  tabsBox.innerHTML = '';
  poolsWithFive.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = 'five-tab' + (p.key === fiveOverviewPool[game] ? ' active' : '');
    btn.textContent = p.label;
    btn.dataset.pool = p.key;
    btn.addEventListener('click', () => {
      fiveOverviewPool[game] = p.key;
      fiveOverviewPage[game] = 1;
      $$('.five-tab', tabsBox).forEach((b) => b.classList.toggle('active', b === btn));
      renderFiveOverview(game, acc);
    });
    tabsBox.appendChild(btn);
  });

  const pity = pityMap(acc);
  const poolKey = fiveOverviewPool[game];
  const fives = acc.records
    .filter((r) => r.pool === poolKey && r.rank === 5)
    .sort(cmpRec)
    .reverse(); // 最新在前

  countChip.textContent = `${fives.length} 个 5★`;

  if (!fives.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    const p = card.querySelector('.five-pager'); if (p) p.remove();
    return;
  }
  empty.hidden = true;

  // 分页：每页 14 个（2 行 × 7 列）
  const totalPages = Math.max(1, Math.ceil(fives.length / FIVE_PAGE_SIZE));
  if (fiveOverviewPage[game] > totalPages) fiveOverviewPage[game] = totalPages;
  const page = fiveOverviewPage[game];
  const pageItems = fives.slice((page - 1) * FIVE_PAGE_SIZE, page * FIVE_PAGE_SIZE);

  grid.innerHTML = pageItems.map((r) => {
    const p = pity.get(r.id) ?? '?';
    const icon = itemIcon(game, r.name, r.type);
    const iconHtml = icon ? `<img class="five-item-icon" src="${icon}" alt="" onerror="this.style.display='none'">` : '';
    // 崩铁角色卡片可点击打开配队推荐
    const clickable = game === 'hsr' && r.type === '角色' ? ' team-char' : '';
    return `<div class="five-item${clickable}"${clickable ? ` data-name="${r.name.replace(/"/g, '&quot;')}"` : ''}>
      ${iconHtml}
      <div class="five-item-name" style="color:${nameColor(r.name)}">${r.name}</div>
      <div class="five-item-meta">
        <span class="five-item-type">${r.type}</span>
        <span class="five-item-pity">${p} 抽出</span>
      </div>
      <div class="five-item-time">${r.time}</div>
    </div>`;
  }).join('');

  // 崩铁角色卡片点击 → 打开配队推荐弹窗
  if (game === 'hsr') {
    grid.querySelectorAll('.team-char').forEach((el) => {
      el.addEventListener('click', () => openTeamRec(el.dataset.name));
    });
  }

  // 分页控件（多页时才显示）
  let pager = card.querySelector('.five-pager');
  if (totalPages > 1) {
    if (!pager) {
      pager = document.createElement('div');
      pager.className = 'five-pager';
      card.appendChild(pager);
    }
    const go = (pg) => {
      fiveOverviewPage[game] = pg;
      renderFiveOverview(game, acc);
    };
    let btns = `<button class="five-page-btn" ${page <= 1 ? 'disabled' : ''} data-go="${page - 1}">上一页</button>`;
    for (let i = 1; i <= totalPages; i++) {
      btns += `<button class="five-page-btn${i === page ? ' active' : ''}" data-go="${i}">${i}</button>`;
    }
    btns += `<button class="five-page-btn" ${page >= totalPages ? 'disabled' : ''} data-go="${page + 1}">下一页</button>`;
    pager.innerHTML = btns;
    pager.querySelectorAll('[data-go]').forEach((b) => {
      b.addEventListener('click', () => go(Number(b.dataset.go)));
    });
  } else if (pager) {
    pager.remove();
  }
}

// ---------- 崩铁·配队：已有角色 / 光锥 ----------
async function renderHsrTeam() {
  const view = $('#view-hsr-team');
  const acc = activeOf('hsr');

  // 账号栏
  const selBtn = $('[data-role="uidSelectBtn"]', view);
  if (selBtn) {
    const txt = selBtn.querySelector('.usb-text');
    if (acc) {
      txt.textContent = acc.remark ? `${acc.uid} · ${acc.remark}` : acc.uid;
      selBtn.classList.remove('empty');
    } else {
      txt.textContent = '选择账号';
      selBtn.classList.add('empty');
    }
    selBtn.disabled = !accountsOf('hsr').length;
  }
  const remarkEl = $('[data-role="abRemark"]', view);
  if (remarkEl) {
    const r = acc?.remark || '';
    remarkEl.textContent = r ? '修改备注' : '新增备注';
    remarkEl.classList.toggle('has', !!r);
    remarkEl.title = r ? `当前备注：${r}，点击修改` : '点击添加账号备注';
  }
  const hint = $('[data-role="abHint"]', view);
  if (hint) {
    if (!acc) { hint.textContent = '未导入'; }
    else {
      const copies = acc.records.length;
      hint.textContent = `${copies} 条记录 · 更新于 ${fmtTime(acc.updatedAt)}`;
    }
  }

  const owned = $('[data-role="teamOwned"]', view);
  const empty = $('[data-role="accountEmpty"]', view);
  if (!acc) {
    empty.hidden = false;
    owned.hidden = true;
    return;
  }
  empty.hidden = true;
  owned.hidden = false;

  // 按需加载崩铁图标映射；若本次触发了实际加载，加载完成后自动重渲一次
  const hadInfo = Object.keys(srCharInfo).length > 0 || Object.keys(srLcInfo).length > 0;
  await loadItemIcons('hsr');
  if (!hadInfo && (Object.keys(srCharInfo).length > 0 || Object.keys(srLcInfo).length > 0)) {
    renderHsrTeam();
    return;
  }

  const grid = $('[data-role="teamGrid"]', view);
  const emptyTip = $('[data-role="teamEmpty"]', view);
  const countChip = $('[data-role="teamCount"]', view);
  const filtersBox = $('[data-role="teamFilters"]', view);

  const infoMap = teamTab === '角色' ? srCharInfo : srLcInfo;

  // 按名称去重，统计数量、最高星级、首次获取时间；附上命途/属性/星级元数据
  const map = new Map();
  acc.records.forEach((r) => {
    if (r.type !== teamTab) return;
    const info = infoMap[r.name] || {};
    const star = info.star ?? r.rank;
    // 三星排除在外
    if (star < 4) return;
    const cur = map.get(r.name);
    if (cur) {
      cur.count += 1;
      cur.rank = Math.max(cur.rank, r.rank);
    } else {
      map.set(r.name, {
        name: r.name, type: r.type, rank: r.rank, count: 1, time: r.time,
        path: info.path || '', property: info.property || '', star,
      });
    }
  });

  const allItems = [...map.values()];

  // 渲染筛选栏：根据当前类型下所有可用物品生成命途/属性/星级选项
  const availPath = [...new Set(allItems.map((i) => i.path).filter(Boolean))].sort();
  const availProp = [...new Set(allItems.map((i) => i.property).filter(Boolean))].sort();
  const availStar = [...new Set(allItems.map((i) => i.star).filter(Boolean))].sort((a, b) => b - a);

  // 光锥没有属性，隐藏属性筛选行
  filtersBox.querySelector('[data-filter="property"]').style.display =
    teamTab === '光锥' ? 'none' : '';

  const renderFilterRow = (key, label, values, valFormatter) => {
    const row = filtersBox.querySelector(`[data-filter="${key}"]`);
    const segs = row.querySelector('.team-filter-segs');
    const current = teamFilter[key];
    // 若当前选中值不在可用列表中，回退为全部
    if (current && !values.map(String).includes(String(current))) teamFilter[key] = '';
    const active = teamFilter[key];
    let html = `<button class="seg${active === '' ? ' active' : ''}" data-val="">全部</button>`;
    values.forEach((v) => {
      const sv = String(v);
      html += `<button class="seg${active === sv ? ' active' : ''}" data-val="${sv}">${valFormatter ? valFormatter(v) : v}</button>`;
    });
    segs.innerHTML = html;
    segs.querySelectorAll('.seg').forEach((b) => {
      b.addEventListener('click', () => {
        teamFilter[key] = b.dataset.val;
        teamPage = 1;
        renderHsrTeam();
      });
    });
  };

  renderFilterRow('path', '命途', availPath);
  renderFilterRow('property', '属性', availProp);
  renderFilterRow('star', '星级', availStar, (v) => `${v}★`);

  // 应用筛选
  const items = allItems
    .filter((it) => {
      if (teamFilter.path && it.path !== teamFilter.path) return false;
      if (teamFilter.property && it.property !== teamFilter.property) return false;
      if (teamFilter.star && String(it.star) !== teamFilter.star) return false;
      return true;
    })
    // 排序：首次获取时间从新到旧
    .sort((a, b) => {
      if (a.time !== b.time) return a.time < b.time ? 1 : -1;
      return a.name < b.name ? -1 : 1;
    });

  countChip.textContent = `${items.length} 个${teamTab}`;

  if (!items.length) {
    grid.innerHTML = '';
    emptyTip.hidden = false;
    const oldPager = owned.querySelector('.team-pager'); if (oldPager) oldPager.remove();
    return;
  }
  emptyTip.hidden = true;

  // 分页：每页最多 2 行（14 个）
  const totalPages = Math.max(1, Math.ceil(items.length / TEAM_PAGE_SIZE));
  if (teamPage > totalPages) teamPage = totalPages;
  if (teamPage < 1) teamPage = 1;
  const pageItems = items.slice((teamPage - 1) * TEAM_PAGE_SIZE, teamPage * TEAM_PAGE_SIZE);

  grid.innerHTML = pageItems.map((it) => {
    const icon = itemIcon('hsr', it.name, it.type);
    const iconHtml = icon ? `<img class="five-item-icon" src="${icon}" alt="" onerror="this.style.display='none'">` : '';
    // 命座/叠影 = 抽到个数 - 1，最高 6 命/叠；仅 1 个时不显示
    const eidolon = Math.min(it.count - 1, 6);
    const copies = it.count > 1 ? `<span class="team-copies">${eidolon}${teamTab === '角色' ? '命' : '叠'}</span>` : '';
    const tags = [it.path, it.property].filter(Boolean).join(' · ');
    const clickable = teamTab === '角色' ? ' team-char' : '';
    return `<div class="five-item${clickable}"${clickable ? ` data-name="${it.name.replace(/"/g, '&quot;')}"` : ''}>
      <div class="team-icon-wrap">${iconHtml}${copies}</div>
      <div class="five-item-name" style="color:${nameColor(it.name)}">${it.name}</div>
      <div class="five-item-meta">
        <span class="five-item-type">${it.star}★</span>
        ${tags ? `<span class="five-item-pity">${tags}</span>` : ''}
      </div>
      <div class="five-item-time">首获 ${it.time}</div>
    </div>`;
  }).join('');

  // 角色卡片点击 → 打开配队推荐弹窗
  grid.querySelectorAll('.team-char').forEach((el) => {
    el.addEventListener('click', () => openTeamRec(el.dataset.name));
  });

  // 分页控件（多页时才显示）
  let pager = owned.querySelector('.team-pager');
  if (totalPages > 1) {
    if (!pager) {
      pager = document.createElement('div');
      pager.className = 'team-pager';
      owned.appendChild(pager);
    }
    const go = (pg) => { teamPage = pg; renderHsrTeam(); };
    let btns = `<button class="team-page-btn" ${teamPage <= 1 ? 'disabled' : ''} data-go="${teamPage - 1}">上一页</button>`;
    for (let i = 1; i <= totalPages; i++) {
      btns += `<button class="team-page-btn${i === teamPage ? ' active' : ''}" data-go="${i}">${i}</button>`;
    }
    btns += `<button class="team-page-btn" ${teamPage >= totalPages ? 'disabled' : ''} data-go="${teamPage + 1}">下一页</button>`;
    pager.innerHTML = btns;
    pager.querySelectorAll('[data-go]').forEach((b) => {
      b.addEventListener('click', () => go(Number(b.dataset.go)));
    });
  } else if (pager) {
    pager.remove();
  }
}

// ---------- 崩铁·配队推荐弹窗 ----------
async function openTeamRec(charName) {
  const acc = activeOf('hsr');
  // 已拥有的角色（按名称去重）
  const ownedNames = new Set();
  if (acc && acc.records) {
    acc.records.forEach((r) => {
      if (r.type === '角色' && Number(r.rank) >= 4) ownedNames.add(r.name);
    });
  }
  // 开拓者所有命途形态默认全部拥有
  Object.keys(srCharMap || {}).forEach((n) => {
    if (n.startsWith('开拓者')) ownedNames.add(n);
  });

  const mask = $('#teamRecMask');
  const title = $('#teamRecTitle');
  const list = $('[data-role="teamRecList"]');
  title.textContent = `${charName} · 配队推荐`;
  list.innerHTML = '<div class="team-rec-empty">加载中…</div>';
  mask.hidden = false;

  // 确保角色图标映射已加载
  await loadItemIcons('hsr');

  try {
    const url = `res/sr/teams/${encodeURIComponent(charName)}.json`;
    const data = await (await fetch(url)).json();
    const teams = data.teams || [];
    if (!teams.length) {
      list.innerHTML = '<div class="team-rec-empty">暂无配队数据</div>';
      return;
    }
    list.innerHTML = teams.map((t) => {
      const mates = (t.mate || []).slice(0, 4).map((m) => {
        const owned = ownedNames.has(m.name);
        const icon = itemIcon('hsr', m.name, '角色');
        const iconHtml = icon
          ? `<img src="${icon}" alt="" onerror="this.style.display='none'">`
          : '';
        const tags = [m.path, m.property].filter(Boolean).join(' · ');
        return `<div class="team-rec-mate ${owned ? 'owned' : 'missing'}">
          <div class="team-rec-mate-icon">${iconHtml}</div>
          <div class="team-rec-mate-name">${m.name}</div>
          <div class="team-rec-mate-tags">${tags}</div>
        </div>`;
      }).join('');
      return `<div class="team-rec-item">
        <div class="team-rec-mates">${mates}</div>
      </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = '<div class="team-rec-empty">配队数据加载失败</div>';
  }
}

function closeTeamRec() {
  $('#teamRecMask').hidden = true;
}

// Esc 关闭配队弹窗
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#teamRecMask').hidden) closeTeamRec();
});

function renderRecords(game) {
  const view = $(`#view-${game}`);
  const acc = activeOf(game);
  if (!acc) return;

  const pad = padMap(acc);
  const poolKey = viewMode[game];
  const { rank, type, q } = recFilter[game];
  const filtered = acc.records
    .filter((r) => (poolKey === 'overview' || r.pool === poolKey)
      && (!rank || r.rank === rank)
      && (!type || r.type === type)
      && (!q || r.name.toLowerCase().includes(q)))
    .sort(cmpRec)
    .reverse();

  // 分页：每页 10 条
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  recFilter[game].page = Math.min(Math.max(1, recFilter[game].page || 1), totalPages);
  const page = recFilter[game].page;
  const recs = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 具体卡池：统计卡片（复用概览 stat-card 样式，不受筛选影响）
  const statsBox = $('[data-role="recStats"]', view);
  const poolRecs = poolKey === 'overview' ? [] : acc.records.filter((r) => r.pool === poolKey).sort(cmpRec);
  if (!poolRecs.length) {
    statsBox.hidden = true;
  } else {
    const cnt = { 5: 0, 4: 0, 3: 0 };
    const gap = { 5: 0, 4: 0, 3: 0 };
    const gaps = { 5: [], 4: [], 3: [] };
    poolRecs.forEach((r) => {
      [5, 4, 3].forEach((k) => gap[k]++);
      cnt[r.rank] += 1;
      gaps[r.rank].push(gap[r.rank]);
      gap[r.rank] = 0;
    });
    const avg = (k) => gaps[k].length ? (gaps[k].reduce((a, b) => a + b, 0) / gaps[k].length).toFixed(1) : '—';
    statsBox.innerHTML = `
      <div class="stat-card"><span>5★ 数量</span><b class="r5">${cnt[5]}</b><i>平均 ${avg(5)} 抽出金</i></div>
      <div class="stat-card"><span>4★ 数量</span><b class="r4">${cnt[4]}</b><i>平均 ${avg(4)} 抽出紫</i></div>
      <div class="stat-card"><span>3★ 数量</span><b class="r3">${cnt[3]}</b><i>平均 ${avg(3)} 抽</i></div>
      <div class="stat-card"><span>总抽数</span><b>${poolRecs.length}</b><i>已垫 ${gap[5]} 抽未出 5★</i></div>
    `;
    statsBox.hidden = false;
  }

  const tbody = $('[data-role="rows"]', view);
  tbody.innerHTML = recs.map((r) => {
    const pool = poolOf(game, r.pool);
    return `<tr>
      <td class="cell-time">${r.time}</td>
      <td class="cell-name">${r.name}</td>
      <td>${stars(r.rank)}</td>
      <td>${r.type}</td>
      <td>${pool ? pool.label : r.pool}</td>
      <td class="cell-pity${r.rank === 5 ? ' gold' : ''}">${pad.get(r.id) ?? '·'}</td>
    </tr>`;
  }).join('');

  $('[data-role="empty"]', view).hidden = filtered.length > 0;
  $('[data-role="poolChip"]', view).textContent =
    poolKey === 'overview' ? '全部' : poolOf(game, poolKey).label;
  $('[data-role="count"]', view).textContent =
    `共 ${filtered.length} 条记录${rank || type || q ? '（已筛选）' : ''}`;

  // 分页器
  const pager = $('[data-role="pager"]', view);
  pager.hidden = totalPages <= 1;
  $('[data-role="pageInfo"]', view).textContent = `${page} / ${totalPages}`;
  $('[data-role="prevPage"]', view).disabled = page <= 1;
  $('[data-role="nextPage"]', view).disabled = page >= totalPages;
}

// ---------- 总览渲染 ----------
// 各游戏数据完全独立展示，不做跨游戏汇总
// 保底区间：hard-20 起为高概率区，hard-10 起将近保底，hard 为硬保底
function pityZone(pad, hard) {
  if (pad >= hard - 10) return 'near';
  if (pad >= hard - 20) return 'soft';
  return 'norm';
}

function renderOverview() {
  const grid = $('#ovGames');
  grid.innerHTML = GAME_ORDER.map((key) => {
    const g = GAMES[key];
    const acc = activeOf(key);
    const head = `<div class="gcard-top">
        <span class="gcard-icon">${ICONS[key]}</span>
        <div><div class="gcard-name">${g.name} · ${g.act}</div><div class="gcard-sub">${g.sub}</div></div>
        <span class="btn-sm gcard-update" data-act="update" data-game="${key}">更新记录</span>
      </div>`;

    if (!acc || !acc.records.length) {
      return `<button class="gcard ${key}" data-goto="${key}">
        ${head}
        <div class="gcard-empty">未导入数据</div>
        <div class="gcard-foot">
          <span class="gcard-time">前往「${g.name}」页导入或更新数据</span>
          <span class="gcard-go">查看记录 →</span>
        </div>
      </button>`;
    }

    const recs = acc.records;
    const pity = pityMap(acc);
    const c5 = recs.filter((r) => r.rank === 5).length;
    const c4 = recs.filter((r) => r.rank === 4).length;
    const avg = c5 ? (recs.length / c5).toFixed(1) : '—';
    const latest = [...recs].sort(cmpRec).at(-1).time.slice(0, 10);

    // 各卡池独立统计：抽数 / 5★数 / 已垫（无记录的卡池不显示）
    const poolRows = g.pools.map((p) => {
      const rs = recs.filter((r) => r.pool === p.key).sort(cmpRec);
      if (!rs.length) return '';
      let lastIdx = -1;
      rs.forEach((r, i) => { if (r.rank === 5) lastIdx = i; });
      const pad = lastIdx === -1 ? rs.length : rs.length - 1 - lastIdx;
      const pc5 = rs.filter((r) => r.rank === 5).length;
      const zone = pityZone(pad, p.hard);
      const tag = zone === 'near' ? '<i class="gp-tag near">将近保底</i>'
        : zone === 'soft' ? '<i class="gp-tag soft">高概率</i>' : '';
      return `<div class="gp-row">
        <span class="gp-name">${p.label}${tag}</span>
        <span class="gp-val">${rs.length}抽 · <b>5★×${pc5}</b> · 已垫<b class="pad ${zone}">${pad}</b></span>
      </div>`;
    }).join('');

    // 最近 3 个 5★：名字着色 + 出货抽数 + 所属卡池 + 日期
    const fiveRows = recs.filter((r) => r.rank === 5).sort(cmpRec).slice(-3).reverse()
      .map((r) => {
        const pool = poolOf(key, r.pool);
        const poolLabel = pool ? pool.label : r.pool;
        return `<div class="gf-item" title="${r.time} · ${poolLabel}">
          <span class="gf-name" style="color:${nameColor(r.name)}">${r.name}[${pity.get(r.id) ?? '?'}]</span>
          <span class="gf-meta">${poolLabel} · ${r.time.slice(5, 10)}</span>
        </div>`;
      }).join('');

    return `<button class="gcard ${key}" data-goto="${key}">
      ${head}
      <div class="gcard-stats">
        <div><span>总抽数</span><b>${recs.length}</b></div>
        <div><span>5★</span><b class="r5">${c5}</b></div>
        <div><span>4★</span><b class="r4">${c4}</b></div>
        <div><span>平均出金</span><b>${avg}</b></div>
      </div>
      <div class="gcard-sec">各卡池</div>
      <div class="gcard-pools">${poolRows}</div>
      <div class="gcard-sec">最近 5★</div>
      <div class="gcard-fives">${fiveRows || '<div class="gf-none">暂无 5★ 记录</div>'}</div>
      <div class="gcard-foot">
        <span class="gcard-time">最近记录 ${latest}</span>
        <span class="gcard-go">查看记录 →</span>
      </div>
    </button>`;
  }).join('');
  $$('.gcard', grid).forEach((card) =>
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]')) return;
      switchView(card.dataset.goto);
    }));

  renderOverviewPity();
  renderAccounts();
}

// 保底进度面板：各游戏主卡池（配置首个卡池）的已垫进度条，按保底区间着色
// 无数据的游戏也渲染占位条（已垫 —，填充 0%），保证四格刻度布局完整
function renderOverviewPity() {
  const box = $('#ovPity');
  const cells = GAME_ORDER.map((key) => {
    const g = GAMES[key];
    const acc = activeOf(key);
    const pool = g.pools[0];
    const hard = pool.hard;
    const pct = (v) => ((v / hard) * 100).toFixed(1);
    const softPct = pct(hard - 20), nearPct = pct(hard - 10);

    let pad = null;
    if (acc) {
      const rs = acc.records.filter((r) => r.pool === pool.key).sort(cmpRec);
      if (rs.length) {
        let lastIdx = -1;
        rs.forEach((r, i) => { if (r.rank === 5) lastIdx = i; });
        pad = lastIdx === -1 ? rs.length : rs.length - 1 - lastIdx;
      }
    }
    const zone = pad === null ? 'norm' : pityZone(pad, hard);

    return `<div class="ovp-cell ${key}">
      <div class="ovp-head">
        <span class="ovp-game">${g.name}</span>
        <span class="ovp-pool">${pool.label}</span>
        <b class="ovp-pad ${zone}">${pad === null ? '—' : pad}</b><span class="ovp-of">/ ${hard} 抽</span>
      </div>
      <div class="ovp-bar">
        <i class="ovp-zone soft" style="left:${softPct}%;width:${(nearPct - softPct).toFixed(1)}%"></i>
        <i class="ovp-zone near" style="left:${nearPct}%;width:${(100 - nearPct).toFixed(1)}%"></i>
        <i class="ovp-fill ${zone}" style="width:${pad === null ? 0 : pct(pad)}%"></i>
      </div>
      <div class="ovp-scale">
        <span class="tk l">0</span>
        <span class="tk" style="left:${softPct}%">${hard - 20}</span>
        <span class="tk" style="left:${nearPct}%">${hard - 10}</span>
        <span class="tk r">${hard}</span>
      </div>
    </div>`;
  }).join('');

  box.hidden = false;
  box.innerHTML = `<div class="ov-pity-head">
      <h2>保底进度 · 主卡池已垫</h2>
      <span class="ovp-legend"><i class="lg soft"></i>高概率区间（保底-20 起）<i class="lg near"></i>将近保底（保底-10 起）· 刻度为抽数</span>
    </div>
    <div class="ov-pity-grid">${cells}</div>`;
}

// ---------- 账号管理（设置）：横向游戏选项卡 + 切换下方账号列表 ----------
let acctTab = null; // 当前选中的游戏标签
function renderAccounts() {
  const wrap = $('#accountList');
  const groups = GAME_ORDER.map((g) => ({ game: g, list: accountsOf(g) }));
  const total = groups.reduce((s, x) => s + x.list.length, 0);
  $('#accountsEmpty').style.display = total ? 'none' : '';
  if (!total) { wrap.innerHTML = ''; return; }

  // 默认 / 回退选中第一个有账号的游戏
  if (!acctTab || !accountsOf(acctTab).length) {
    acctTab = (groups.find((x) => x.list.length) || groups[0]).game;
  }

  const tabs = groups.map(({ game, list }) => `
    <button class="acct-tab ${game}${game === acctTab ? ' active' : ''}" data-tab="${game}">
      <span class="acct-tab-icon">${ICONS[game]}</span>
      <span class="acct-tab-name">${GAMES[game].name}</span>
      <span class="acct-tab-count">${list.length}</span>
    </button>`).join('');

  const list = groups.find((x) => x.game === acctTab).list;
  const rows = list.length ? list.map((a) => {
    const current = store.active[acctTab] === a.uid;
    const remark = a.remark || '';
    return `<div class="acct-row ${acctTab}${current ? ' current' : ''}">
      <div>
        <div class="acct-uid">
          ${a.uid}
          <span class="acct-remark ${remark ? '' : 'empty'}" data-remark-edit="${acctTab}:${a.uid}" title="点击编辑账号备注">${remark || '添加备注'}</span>
        </div>
        <div class="acct-meta">${a.records.length} 条记录 · 更新于 ${fmtTime(a.updatedAt)}</div>
      </div>
      ${current ? '<span class="tag-current">当前</span>' : ''}
      <div class="acct-actions">
        ${current ? '' : `<button class="btn-sm" data-switch="${acctTab}:${a.uid}">切换</button>`}
        <button class="btn-sm danger" data-del="${acctTab}:${a.uid}">删除</button>
      </div>
    </div>`;
  }).join('') : '<div class="empty small"><b>该游戏暂无账号</b><p>前往对应游戏页面点击「导入」载入数据文件。</p></div>';

  wrap.innerHTML = `<div class="acct-tabs">${tabs}</div><div class="acct-panel">${rows}</div>`;
}

// ---------- 账号备注弹窗编辑 ----------
let remarkGame = '';
let remarkUid = '';
function openRemarkEdit(game, uid) {
  const acc = accountsOf(game).find((a) => a.uid === uid);
  if (!acc) return;
  remarkGame = game;
  remarkUid = uid;
  const has = !!acc.remark;
  $('#remarkTitle').textContent = has ? '修改备注' : '新增备注';
  $('#remarkSub').textContent = has ? `当前备注：${acc.remark}` : '为该账号添加备注，方便区分是谁的账号';
  const input = $('#remarkInput');
  input.value = acc.remark || '';
  $('#remarkMask').hidden = false;
  setTimeout(() => { input.focus(); input.select(); }, 50);
}
function closeRemarkEdit() {
  $('#remarkMask').hidden = true;
  remarkGame = '';
  remarkUid = '';
}
let remarkSaving = false;
async function saveRemark() {
  if (remarkSaving) return;
  const game = remarkGame;
  const acc = accountsOf(game).find((a) => a.uid === remarkUid);
  if (!acc) return;
  remarkSaving = true;
  try {
    acc.remark = $('#remarkInput').value.trim();
    await save();
    closeRemarkEdit();
    renderGame(game);
    renderOverview();
    renderAccounts();
    if (game === 'hsr') renderHsrTeam();
    toast(acc.remark ? '备注已保存' : '备注已清除');
  } finally {
    remarkSaving = false;
  }
}
$('#remarkInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); saveRemark(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeRemarkEdit(); }
});

$('#accountList').addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { acctTab = tab.dataset.tab; renderAccounts(); return; }
  const re = e.target.closest('[data-remark-edit]');
  if (re) {
    const [game, uid] = re.dataset.remarkEdit.split(':');
    openRemarkEdit(game, uid);
    return;
  }
  const sw = e.target.closest('[data-switch]');
  const del = e.target.closest('[data-del]');
  if (sw) {
    const [game, uid] = sw.dataset.switch.split(':');
    store.active[game] = uid;
    await save();
    renderGame(game);
    renderOverview();
    if (game === 'hsr') renderHsrTeam();
    toast(`已切换到账号 ${uid}`);
  } else if (del) {
    const [game, uid] = del.dataset.del.split(':');
    store.accounts[game] = accountsOf(game).filter((a) => a.uid !== uid);
    if (store.active[game] === uid) {
      store.active[game] = accountsOf(game)[0]?.uid || null;
    }
    await save();
    renderGame(game);
    renderOverview();
    if (game === 'hsr') renderHsrTeam();
    toast(`已删除账号 ${uid}`);
  }
});

// ---------- 导入 ----------
function normalize(game, item) {
  const cfg = GAMES[game];
  // 鸣潮：API 返回 cardPoolType/qualityLevel/resourceType，id 为主进程合成（时间|名称|池|序号）
  if (cfg.rawWuwa) {
    const pool = cfg.poolMap[String(item.cardPoolType)];
    if (!pool) return null;
    return {
      id: String(item.id || `${item.time}|${item.name}|${item.cardPoolType}|0`),
      time: item.time || '',
      name: item.name || '',
      type: item.resourceType || '',
      rank: Number(item.qualityLevel) || 3,
      pool,
      gt: String(item.cardPoolType),
    };
  }
  const code = item.uigf_gacha_type || item.gacha_type;
  const pool = cfg.poolMap[code];
  if (!pool) return null;
  return {
    id: String(item.id || `${item.time}|${item.name}|${code}`),
    time: item.time,
    name: item.name,
    type: item.item_type || '',
    rank: cfg.rankMap ? (cfg.rankMap[item.rank_type] || 3) : (Number(item.rank_type) || 3),
    pool,
    gt: String(item.gacha_type || ''), // 原始卡池类型（原神 400 = 角色活动祈愿-2；绝区零 102/103 = 重映/回响频段）
  };
}

// 合并账号记录（导入/在线获取共用），返回新增条数
function applyUids(game, uids) {
  let added = 0;
  uids.forEach(({ uid, list }) => {
    uid = uid || '未知UID';
    let acc = accountsOf(game).find((a) => a.uid === uid);
    if (!acc) {
      acc = { uid, records: [], updatedAt: 0, remark: '' };
      accountsOf(game).push(acc);
    }
    const ids = new Set(acc.records.map((r) => r.id));
    const fresh = list.map((i) => normalize(game, i)).filter((r) => r && !ids.has(r.id));
    acc.records.push(...fresh);
    acc.records.sort(cmpRec);
    acc.updatedAt = Date.now();
    added += fresh.length;
    store.active[game] = uid;
  });
  return added;
}

async function importData(game) {
  // 鸣潮：无 UIGF 标准，导入走 Excel（工作表名=卡池名，含 UID 工作表）
  if (game === 'wuwa') {
    const res = await api.importWuwaExcel();
    if (!res) return;
    if (res.error) { toast(res.error); return; }
    const added = applyUids(game, res.uids);
    await save();
    renderGame(game);
    renderOverview();
    if (game === 'hsr') renderHsrTeam();
    toast(`导入完成：${res.uids.length} 个账号，新增 ${added} 条记录`);
    return;
  }
  if (GAMES[game].noUigf) {
    toast(`「${GAMES[game].name}」暂无 UIGF 标准，请使用「更新数据」在线获取`);
    return;
  }
  if (!Object.keys(GAMES[game].poolMap).length) {
    toast(`「${GAMES[game].name}」导入功能待接入`);
    return;
  }
  const res = await api.importUIGF(game);
  if (!res) return;
  if (res.error) { toast(res.error); return; }

  const added = applyUids(game, res.uids);
  await save();
  renderGame(game);
  renderOverview();
  if (game === 'hsr') renderHsrTeam();
  toast(`导入完成：${res.uids.length} 个账号，新增 ${added} 条记录`);
}

// 内部卡池 key → API 查询用 gacha_type（按游戏）
// 由 poolMap 反推：内部卡池 key → 原始 gacha_type（取每个 key 的首个 code）
let API_KEY_OF = {};

// 各账号各卡池本地最新记录 id（用于在线增量更新；按原始 gacha_type 分组，原神 301/400 分开记）
function knownLatest(game) {
  const keyOf = API_KEY_OF[game];
  const map = {};
  accountsOf(game).forEach((acc) => {
    const per = {};
    acc.records.forEach((r) => {
      const k = r.gt || keyOf[r.pool];
      if (!k || !/^\d+$/.test(r.id)) return; // 鸣潮等为合成 id，不参与增量
      if (!per[k] || BigInt(r.id) > BigInt(per[k])) per[k] = r.id;
    });
    map[acc.uid] = per;
  });
  return map;
}

// 在线获取（读取游戏缓存链接，增量拉取；link 为空时自动读取缓存）
const FETCH_API = {
  genshin: { call: (k, link) => api.fetchGenshin(k, link), on: (cb) => api.onFetchProgress(cb) },
  hsr: { call: (k, link) => api.fetchHsr(k, link), on: (cb) => api.onHsrProgress(cb) },
  zzz: { call: (k, link) => api.fetchZzz(k, link), on: (cb) => api.onZzzProgress(cb) },
  wuwa: { call: (k, link) => api.fetchWuwa(link), on: (cb) => api.onWuwaProgress(cb) }, // 全量拉取，无需增量参数
};
async function fetchOnline(game, link) {
  if (fetching[game]) return;
  const fetchApi = FETCH_API[game];
  if (!fetchApi) {
    toast(`「${GAMES[game].name}」在线获取待接入`);
    return;
  }
  fetching[game] = true;
  lastUpdateTime[game] = Date.now();
  lastSwitchFetchTime[game] = Date.now(); // 手动/自动更新均重置切换冷却
  const view = $(`#view-${game}`);
  const btn = $('[data-act="update"]', view);
  const hint = $('[data-role="abHint"]', view);
  if (btn) btn.disabled = true;
  if (hint) hint.textContent = link ? '正在通过链接读取…' : '正在读取游戏缓存…';
  const off = fetchApi.on((p) => {
    if (hint) hint.textContent = `正在获取「${p.label}」第 ${p.page} 页（新增 ${p.total} 条）`;
  });
  try {
    const res = await fetchApi.call(knownLatest(game), link);
    if (!res) return;
    if (res.error) { toast(res.error); return; }
    const added = applyUids(game, res.uids);
    await save();
    renderGame(game);
    renderOverview();
    if (game === 'hsr') renderHsrTeam();
    toast(added ? `更新完成：新增 ${added} 条记录` : '数据已是最新');
  } finally {
    off();
    if (btn) btn.disabled = false;
    fetching[game] = false;
    setAbHint(game);
  }
}

// 导出当前账号为 UIGF v4.1
async function exportData(game) {
  if (GAMES[game].noUigf || !API_KEY_OF[game]) {
    toast(`「${GAMES[game].name}」暂无 UIGF 标准，请使用「导出 Excel」`);
    return;
  }
  const acc = activeOf(game);
  if (!acc || !acc.records.length) { toast('当前账号暂无记录'); return; }
  const rankOut = GAMES[game].rankOut; // 绝区零：内部 5/4/3 → 原生 4/3/2
  const records = acc.records.slice().sort(cmpRec).map((r) => {
    const code = r.gt || API_KEY_OF[game][r.pool] || '';
    return {
      uigf_gacha_type: code,
      gacha_type: code,
      item_id: '',
      count: '1',
      time: r.time,
      name: r.name,
      item_type: r.type,
      rank_type: rankOut ? (rankOut[r.rank] || '3') : String(r.rank),
      id: r.id,
    };
  });
  const res = await api.exportUIGF({ game, uid: acc.uid, records });
  if (res?.file) toast(`已导出：${res.file}`);
}

// 导出当前账号为 Excel（每卡池一个工作表，含保底内计数）
async function exportExcel(game) {
  if (!API_KEY_OF[game]) {
    toast(`「${GAMES[game].name}」Excel 导出待接入`);
    return;
  }
  const acc = activeOf(game);
  if (!acc || !acc.records.length) { toast('当前账号暂无记录'); return; }
  const pools = GAMES[game].pools.map((p) => ({
    label: p.label,
    list: acc.records.filter((r) => r.pool === p.key).sort(cmpRec),
  }));
  const res = await api.exportExcel({ game, uid: acc.uid, pools });
  if (res?.file) toast(`已导出：${res.file}`);
}

// 复制抽卡链接 / 打开缓存目录（原神 / 崩铁 / 绝区零 / 鸣潮）
const GAME_URL_API = {
  genshin: { copy: () => api.copyGenshinUrl(), dir: () => api.openGenshinCacheDir() },
  hsr: { copy: () => api.copyHsrUrl(), dir: () => api.openHsrCacheDir() },
  zzz: { copy: () => api.copyZzzUrl(), dir: () => api.openZzzCacheDir() },
  wuwa: { copy: () => api.copyWuwaUrl(), dir: () => api.openWuwaCacheDir() },
};
async function copyGameUrl(game) {
  const res = await GAME_URL_API[game].copy();
  toast(res?.ok ? '链接已复制到剪贴板' : (res?.error || '复制失败'));
}
async function openGameCacheDir(game) {
  const res = await GAME_URL_API[game].dir();
  if (!res?.ok) toast(res?.error || '打开失败');
}

// ---------- 链接更新 ----------
const LINK_HINTS = {
  genshin: '在游戏内打开「祈愿历史记录」，从网页地址栏复制完整链接（需包含 authkey）。',
  hsr: '在游戏内打开「跃迁记录」，复制包含 authkey 的完整链接。',
  zzz: '在游戏内打开「调频记录」，复制包含 authkey 的完整链接。',
  wuwa: '粘贴唤取记录链接（含 player_id、record_id 等参数，约 24 小时有效）。',
};
let linkGame = '';

function openLinkUpdate(game) {
  linkGame = game;
  $('#linkTitle').textContent = `通过链接更新 · ${GAMES[game].name}`;
  $('#linkHint').textContent = LINK_HINTS[game] || '';
  $('#linkInput').value = '';
  $('#linkMask').hidden = false;
  $('#linkInput').focus();
}

function closeLinkUpdate() {
  $('#linkMask').hidden = true;
  linkGame = '';
}

function submitLinkUpdate() {
  const url = $('#linkInput').value.trim();
  if (!url) return toast('请先粘贴链接');
  if (!/^https?:\/\//i.test(url)) return toast('链接需以 http:// 或 https:// 开头');
  const game = linkGame;
  closeLinkUpdate();
  fetchOnline(game, url);
}

// 账号选择弹窗：点击账号切换
$('#acctSelectMask').addEventListener('click', async (e) => {
  const pick = e.target.closest('[data-pick]');
  if (!pick) return;
  const [game, uid] = pick.dataset.pick.split(':');
  store.active[game] = uid;
  recFilter[game].page = 1;
  await save();
  closeAcctSelect();
  renderGame(game);
  renderOverview();
  // 切换崩铁账号后同步刷新配队页
  if (game === 'hsr') renderHsrTeam();
});

// ---------- 操作按钮 ----------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const game = btn.closest('[data-game]')?.dataset.game;

  if (act === 'import' && game) return importData(game);
  if (act === 'update' && game) return fetchOnline(game);
  if (act === 'linkUpdate' && game) return openLinkUpdate(game);
  if (act === 'closeLink') return closeLinkUpdate();
  if (act === 'closeAcctSelect') return closeAcctSelect();
  if (act === 'closeRemark') return closeRemarkEdit();
  if (act === 'closeTeamRec') return closeTeamRec();
  if (act === 'saveRemark') return saveRemark();
  if (act === 'submitLink') return submitLinkUpdate();
  if (act === 'export' && game) return exportData(game);
  if (act === 'exportExcel' && game) return exportExcel(game);
  if (act === 'copyUrl' && GAME_URL_API[game]) return copyGameUrl(game);
  if (act === 'cacheDir' && GAME_URL_API[game]) return openGameCacheDir(game);
  if (act === 'openDir') return api.openDataDir();
  if (act === 'pickDir') return pickDataDir();
  if (act === 'addAccount') return toast('请前往对应游戏页面点击「导入」载入数据文件');
  if (act === 'checkUpdate') return checkUpdate();
  if (act === 'startUpdate') return startUpdate();
  if (act === 'closeUpdate') return closeUpdateDialog();
  if (act === 'openGithub') return api.openExternal('https://github.com/XLoDream/XuanLuo-Gacha-Export-Hub');

  const ACT_TEXT = {
    update: '更新数据', export: '导出 UIGF', importAll: '批量导入',
    exportAll: '导出全部', pickDir: '更改数据目录',
  };
  toast(`「${ACT_TEXT[act] || '该功能'}」待接入`);
});

// 账号选择弹窗
let acctSelectGame = '';
function openAcctSelect(game) {
  const list = accountsOf(game);
  if (!list.length) { toast('暂无账号，请先导入'); return; }
  acctSelectGame = game;
  const curUid = store.active[game];
  $('#acctSelectTitle').textContent = `选择账号 · ${GAMES[game].name}`;
  $('[data-role="acctSelectList"]').innerHTML = list.map((a) => {
    const current = a.uid === curUid;
    const remark = a.remark || '';
    return `<button class="asc-item${current ? ' current' : ''}" data-pick="${game}:${a.uid}">
      <div class="asc-main">
        <span class="asc-uid">${a.uid}${remark ? ` · ${remark}` : ''}</span>
      </div>
      <div class="asc-meta">${a.records.length} 条记录 · 更新于 ${fmtTime(a.updatedAt)}</div>
      ${current ? '<span class="asc-current-badge">当前</span>' : ''}
    </button>`;
  }).join('');
  $('#acctSelectMask').hidden = false;
}
function closeAcctSelect() {
  $('#acctSelectMask').hidden = true;
  acctSelectGame = '';
}

// 账号下拉切换（改为弹窗选择）
function setupUidSelects() {
  GAME_ORDER.forEach((game) => {
    const btn = $(`#view-${game} [data-role="uidSelectBtn"]`);
    if (btn) btn.addEventListener('click', () => openAcctSelect(game));
    // 账号备注点击编辑
    const abRemark = $(`#view-${game} [data-role="abRemark"]`);
    if (abRemark) {
      abRemark.addEventListener('click', () => {
        const acc = activeOf(game);
        if (!acc) { toast('请先导入账号'); return; }
        openRemarkEdit(game, acc.uid);
      });
    }
  });

  // 崩铁·配队：共用崩铁账号
  const teamView = $('#view-hsr-team');
  if (teamView) {
    const teamBtn = $('[data-role="uidSelectBtn"]', teamView);
    if (teamBtn) teamBtn.addEventListener('click', () => openAcctSelect('hsr'));
    const teamRemark = $('[data-role="abRemark"]', teamView);
    if (teamRemark) {
      teamRemark.addEventListener('click', () => {
        const acc = activeOf('hsr');
        if (!acc) { toast('请先导入账号'); return; }
        openRemarkEdit('hsr', acc.uid);
      });
    }
    // 角色 / 光锥 切换
    $$('[data-role="teamTabs"] .seg', teamView).forEach((seg) => {
      seg.addEventListener('click', () => {
        teamTab = seg.dataset.type;
        // 切换类型时重置筛选条件与页码
        teamFilter = { path: '', property: '', star: '' };
        teamPage = 1;
        $$('[data-role="teamTabs"] .seg', teamView).forEach((s) => s.classList.toggle('active', s === seg));
        renderHsrTeam();
      });
    });
  }
}

// ---------- 图标 ----------
const ICONS = new Proxy({}, {
  get: (_, key) => GAMES?.[key]?.icon ? `<img src="${GAMES[key].icon}" alt="" />` : '',
});

// ---------- 启动 ----------
(async () => {
  // 加载游戏卡池配置（json/games.json，可热更新）
  try {
    GAMES = await fetch('json/games.json').then((r) => r.json());
  } catch (e) {
    toast('加载卡池配置失败：' + e.message);
    return;
  }
  GAME_ORDER = Object.keys(GAMES);

  // 物品图标映射改为按需加载（进入对应游戏视图时加载，5 分钟未访问自动卸载）

  // 由 poolMap 反推内部 key → 原始 gacha_type（取每个 key 首个 code）
  API_KEY_OF = {};
  GAME_ORDER.forEach((g) => {
    const map = {};
    for (const [code, key] of Object.entries(GAMES[g].poolMap || {})) {
      if (!(key in map)) map[key] = code;
    }
    API_KEY_OF[g] = map;
  });

  // 初始化各游戏运行时状态
  store = { active: {}, accounts: {} };
  carIdx = {}; carLock = {};
  viewMode = {}; recFilter = {}; subRefs = {};
  GAME_ORDER.forEach((g) => {
    store.active[g] = null;
    store.accounts[g] = [];
    carIdx[g] = 0;
    carLock[g] = false;
    viewMode[g] = 'overview';
    recFilter[g] = { rank: 0, type: '', q: '', page: 1 };
    subRefs[g] = [];
    VIEW_TITLES[g] = `${GAMES[g].name} · ${GAMES[g].act}`;
  });
  // 崩铁·配队：标题从崩铁配置派生
  if (GAMES['hsr']) VIEW_TITLES['hsr-team'] = `${GAMES['hsr'].name} · 配队`;

  setupGameSubgroups();
  setupUidSelects();

  const loaded = await api.loadStore();
  if (loaded && loaded.accounts) store = loaded;

  // 迁移：鸣潮卡池细分后（新旅/联动/忆旅拆角色+武器、新手拆 5/6/7），旧 pool 键按 gt 重映射
  let migrated = false;
  const wuwaValid = new Set(Object.values(GAMES.wuwa.poolMap));
  (store.accounts.wuwa || []).forEach((acc) => acc.records.forEach((r) => {
    if (!wuwaValid.has(r.pool)) {
      const p = GAMES.wuwa.poolMap[r.gt];
      if (p) { r.pool = p; migrated = true; }
    }
  }));
  if (migrated) save();

  // 兜底：有账号但未选中时，自动选中第一个
  let needSave = false;
  GAME_ORDER.forEach((g) => {
    if (!store.active[g] && store.accounts[g]?.length) {
      store.active[g] = store.accounts[g][0].uid;
      needSave = true;
    }
  });
  if (needSave) save();

  GAME_ORDER.forEach(renderGame);
  renderOverview();

  // 当前所在游戏视图每 20 分钟自动更新一次记录（可在设置中开关）
  const AUTO_UPDATE_INTERVAL = 20 * 60 * 1000;
  setInterval(() => {
    const active = document.querySelector('.view.active');
    const game = active ? active.id.slice(5) : null; // 'view-xxx' -> 'xxx'
    // 物品图标映射：当前游戏保活，其他游戏超过 5 分钟未访问则卸载
    FIVE_OVERVIEW_GAMES.forEach((g) => {
      if (g === game) {
        if (iconLoadTime[g]) iconLoadTime[g] = Date.now(); // 保活
      } else if (iconLoadTime[g] && Date.now() - iconLoadTime[g] >= ICON_UNLOAD_MS) {
        unloadItemIcons(g);
      }
    });
    if (!active || !GAMES[game]) return;
    // 刷新下次自动更新时间提示（开关状态或时间变化时同步）
    setAbHint(game);
    if (!autoUpdateEnabled || fetching[game]) return;
    if (Date.now() - (lastUpdateTime[game] || 0) >= AUTO_UPDATE_INTERVAL) {
      fetchOnline(game);
    }
  }, 60 * 1000);

  refreshDataDirInput();
  applyAutoUpdate(autoUpdateEnabled);
  applyAutoUpdateOnSwitch(autoUpdateOnSwitchEnabled);
  if (window.versions) {
    $('#aboutVersions').textContent =
      `Electron ${versions.electron} · Chrome ${versions.chrome} · Node ${versions.node}`;
  }
  moveIndicator();
})();

// 数据目录选择与显示
async function refreshDataDirInput() {
  $('#dataDirInput').value = await api.dataDir();
}
async function pickDataDir() {
  const dir = await api.pickDir();
  if (!dir) return;
  await api.saveSettings({ dataDir: dir });
  await refreshDataDirInput();
  toast('数据目录已更改，重启应用后生效');
}

// 手动检查更新（自动检查在启动时由主进程执行）
async function checkUpdate() {
  setUpdateState('checking');
  const r = await api.checkUpdate();
  if (r.status === 'dev') {
    closeUpdateDialog();
    return toast('开发环境不检查更新');
  }
  if (r.status === 'error') return setUpdateState('error', { message: r.error });
  if (r.downloaded) return setUpdateState('downloaded', { version: r.latest });
  if (r.latest && r.latest !== r.current) return setUpdateState('available', { version: r.latest, sources: r.sources });
  setUpdateState('latest', { version: r.current });
}
