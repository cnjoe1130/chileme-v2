/* ============ 食物库：381 条 food-db.json 加载 + 打分搜索 ============ */
import { loadMacroOverrides } from "./storage.js";

let DB = [];          // [{name, kcal, unit, category, protein, carb, fat, confidence}]
let BY_NAME = new Map();

/** 14 类 → 红绿灯（与 v1 规则一致） */
const CAT_TRAFFIC = {
  "主食": "yellow", "蛋白质": "green", "蔬菜": "green", "水果": "green",
  "乳制品": "yellow", "饮品": "yellow", "零食": "red", "外食": "red",
  "烘焙": "red", "甜品": "red", "烧烤": "red", "早餐": "yellow",
  "酒类": "red", "其他": "yellow",
};

/** 分类默认宏量估算（g/100kcal 近似，v1 MACRO_DEFAULTS 精神重制） */
const CAT_MACRO_DEFAULTS = {
  "主食": { p: 8, c: 75, f: 2 },
  "蛋白质": { p: 55, c: 5, f: 25 },
  "蔬菜": { p: 20, c: 50, f: 10 },
  "水果": { p: 5, c: 85, f: 5 },
  "乳制品": { p: 25, c: 40, f: 25 },
  "饮品": { p: 5, c: 80, f: 5 },
  "零食": { p: 10, c: 60, f: 30 },
  "外食": { p: 25, c: 45, f: 30 },
  "烘焙": { p: 10, c: 55, f: 35 },
  "甜品": { p: 8, c: 60, f: 32 },
  "烧烤": { p: 30, c: 30, f: 40 },
  "早餐": { p: 20, c: 55, f: 25 },
  "酒类": { p: 0, c: 30, f: 0 },
  "其他": { p: 15, c: 55, f: 25 },
};

export function trafficColor(item) {
  return CAT_TRAFFIC[item?.category] || "yellow";
}

/** 获取某食物的宏量营养素：覆盖 > DB > 分类默认（部分字段缺失则混合估算） */
export function getMacros(name, kcal, category) {
  const ov = loadMacroOverrides()[name];
  if (ov) return { ...ov, estimated: false };
  const hit = BY_NAME.get(name);
  const d = CAT_MACRO_DEFAULTS[category ?? hit?.category] ?? CAT_MACRO_DEFAULTS["其他"];
  const ratio = (kcal || hit?.kcal || 100) / 100;
  const p = hit?.protein != null ? hit.protein : d.p;
  const c = hit?.carb != null ? hit.carb : d.c;
  const f = hit?.fat != null ? hit.fat : d.f;
  const fullyFromDB = hit && hit.protein != null && hit.carb != null && hit.fat != null;
  return {
    protein: Math.round(p * ratio),
    carb: Math.round(c * ratio),
    fat: Math.round(f * ratio),
    estimated: !fullyFromDB,
  };
}

/** 打分搜索：全等 100 / 前缀 80 / 包含 60 / 模糊子序列 30 */
export function search(query, limit = 15) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const item of DB) {
    const n = item.name.toLowerCase();
    let s = 0;
    if (n === q) s = 100;
    else if (n.startsWith(q)) s = 80;
    else if (n.includes(q)) s = 60;
    else if (isSubsequence(q, n)) s = 30;
    if (s) scored.push({ item, s: s - item.name.length * 0.05 });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.item);
}

function isSubsequence(q, n) {
  let i = 0;
  for (const ch of n) if (ch === q[i]) i++;
  return i === q.length;
}

export function highlightMatch(name, query) {
  const q = query.trim();
  if (!q) return escapeHtml(name);
  const idx = name.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return escapeHtml(name);
  return escapeHtml(name.slice(0, idx)) + "<mark>" + escapeHtml(name.slice(idx, idx + q.length)) + "</mark>" + escapeHtml(name.slice(idx + q.length));
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function dbStats() {
  return { total: DB.length, cats: [...new Set(DB.map((x) => x.category))].length };
}

export function byCategory() {
  const map = new Map();
  for (const item of DB) {
    if (!map.has(item.category)) map.set(item.category, []);
    map.get(item.category).push(item);
  }
  return map;
}

/** 启动时加载 food-db.json（需经 http 服务；file:// 下自动降级为内置最小集） */
export async function initDB() {
  try {
    const r = await fetch("food-db.json", { cache: "no-store" });
    const raw = await r.json();
    DB = (raw.foods || []).map((f) => ({
      name: f.name,
      kcal: f.kcal,
      unit: f.unit || "",
      category: f.category || "其他",
      protein: f.protein ?? null,
      carb: f.carbohydrate ?? f.carb ?? null,
      fat: f.fat ?? null,
      confidence: f.confidence || "medium",
    }));
  } catch {
    DB = [
      { name: "米饭", kcal: 116, unit: "100g", category: "主食", protein: null, carb: null, fat: null, confidence: "highest" },
      { name: "鸡蛋", kcal: 78, unit: "1个", category: "蛋白质", protein: null, carb: null, fat: null, confidence: "highest" },
      { name: "燕麦粥", kcal: 320, unit: "1碗", category: "早餐", protein: null, carb: null, fat: null, confidence: "medium" },
    ];
  }
  DB.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  BY_NAME = new Map(DB.map((x) => [x.name, x]));
  return DB.length;
}
