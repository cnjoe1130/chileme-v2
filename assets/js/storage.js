/* ============ 存储层：localStorage（key 与 v1 兼容） ============ */
import { todayStr } from "./calc.js";

const KEY = {
  meals: (d) => `nutrition_meals_${d}`,
  weights: "nutrition_weights",
  profile: "nutrition_profile",
  theme: "nutrition_theme",       // v1 兼容（light/dark）
  skin: "nutrition_skin_v2",      // v2 双主题（brutal/terminal）
  macroOverrides: "nutrition_macro_overrides", // v2 新增：宏量营养素覆盖持久化
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 配额满静默 */ }
}

/* ---- 每日餐次 ---- */
export function loadMeals(dateStr = todayStr()) {
  return read(KEY.meals(dateStr), []);
}

export function saveMeals(meals, dateStr = todayStr()) {
  write(KEY.meals(dateStr), meals);
}

/* ---- 体重 ---- */
export function loadWeights() {
  return read(KEY.weights, []);
}

export function upsertWeight(dateStr, value) {
  const list = loadWeights().filter((w) => w.date !== dateStr);
  list.push({ date: dateStr, value });
  list.sort((a, b) => a.date < b.date ? -1 : 1);
  write(KEY.weights, list);
  return list;
}

/* ---- 档案 ---- */
export function loadProfile() {
  return read(KEY.profile, null);
}

export function saveProfile(p) {
  write(KEY.profile, p);
}

/* ---- v2 皮肤 ---- */
export function loadSkin() {
  return localStorage.getItem(KEY.skin) || "brutal";
}

export function saveSkin(s) {
  try { localStorage.setItem(KEY.skin, s); } catch { /* ignore */ }
}

/* ---- v2 新增：营养素覆盖（修复 v1 刷新丢失的 bug） ---- */
export function loadMacroOverrides() {
  return read(KEY.macroOverrides, {});
}

export function setMacroOverride(name, macros) {
  const all = loadMacroOverrides();
  all[name] = macros;
  write(KEY.macroOverrides, all);
}

/* ---- 导出 / 重置 ---- */
export function exportAll() {
  const meals = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("nutrition_meals_")) meals[k] = read(k, []);
  }
  return {
    version: "v2",
    exportedAt: new Date().toISOString(),
    meals,
    weights: loadWeights(),
    profile: loadProfile(),
    macroOverrides: loadMacroOverrides(),
  };
}

export function resetAll() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith("nutrition_") || k.startsWith("chileme_"))) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
  return keys.length;
}
