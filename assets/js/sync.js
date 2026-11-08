/* ============ 同步层：可选本地服务器（3 秒轮询，服务器为准） ============ */
import { todayStr } from "./calc.js";
import { loadMeals, saveMeals, loadWeights, upsertWeight, loadProfile, saveProfile } from "./storage.js";

const POLL_MS = 3000;
let serverOK = false;
let lastHash = "";
let onChange = null; // (dateStr) => void，数据被服务器刷新时回调

function isPages() {
  return location.hostname.endsWith(".github.io");
}

async function probe() {
  try {
    const r = await fetch("/data/__probe__.json", { cache: "no-store" });
    return r.ok || r.status === 404;
  } catch { return false; }
}

export async function startSync(callback) {
  onChange = callback;
  if (isPages()) return; // 纯静态部署时禁用同步（继承 v1 nutrition-gui 的逻辑）
  serverOK = await probe();
  if (!serverOK) return;
  await pull(todayStr());
  setInterval(() => pull(todayStr()), POLL_MS);
}

export function getServerOK() {
  return serverOK;
}

export async function push(dateStr) {
  if (!serverOK) return;
  try {
    const body = JSON.stringify({
      meals: loadMeals(dateStr),
      weights: loadWeights(),
      profile: loadProfile() || {},
    });
    await fetch(`/data/${dateStr}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch { /* 离线静默：本地优先 */ }
}

async function pull(dateStr) {
  let data;
  try {
    const r = await fetch(`/data/${dateStr}.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    data = await r.json();
  } catch { return; }

  const hash = JSON.stringify(data);
  if (hash === lastHash) return;
  lastHash = hash;

  // meals：服务器为准全量替换
  if (Array.isArray(data.meals)) {
    saveMeals(data.meals, dateStr);
  }
  // weights：按日期合并，服务器空数组不覆盖本地
  if (Array.isArray(data.weights) && data.weights.length) {
    for (const w of data.weights) {
      if (w?.date && typeof w.value === "number") upsertWeight(w.date, w.value);
    }
  }
  // profile：服务器非空则采纳
  if (data.profile && typeof data.profile === "object" && Object.keys(data.profile).length) {
    saveProfile(data.profile);
  }
  onChange?.(dateStr);
}

/** 外部写入数据后（如 sync_to_gui.py），下次轮询前主动拉一次 */
export async function refreshNow(dateStr = todayStr()) {
  if (serverOK) await pull(dateStr);
}
