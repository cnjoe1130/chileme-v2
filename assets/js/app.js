/* ============ 吃了么 v2 · 主应用 ============ */
import { todayStr, dateLabel, shiftDate, fmt, completeProfile, calcMacros } from "./calc.js";
import { loadMeals, saveMeals, loadWeights, upsertWeight, loadProfile, saveProfile,
         loadSkin, saveSkin, exportAll, resetAll, loadMacroOverrides } from "./storage.js";
import { startSync, push, getServerOK, refreshNow } from "./sync.js";
import { initDB, search, highlightMatch, trafficColor, getMacros, dbStats, byCategory, escapeHtml } from "./db.js";
import { drawLine, drawBars } from "./charts.js";

/* ---------- 常量 ---------- */
const MEAL_ORDER = ["早餐", "午餐", "晚餐", "加餐"];
const MEAL_ICONS = { "早餐": "🌅", "午餐": "🍛", "晚餐": "🌙", "加餐": "🍪" };
const GOAL_DEFAULT = 1800;
const GLOSSARY = [
  ["kcal 千卡", "能量单位，日常说的\"大卡\"。1 kg 脂肪约等于 7,700 kcal 缺口。"],
  ["BMR 基础代谢", "完全静息时身体一天消耗的热量，由性别/年龄/身高/体重决定。"],
  ["TDEE 每日总消耗", "BMR × 活动系数。减脂吃 TDEE-500，增肌吃 TDEE+300。"],
  ["Mifflin-St Jeor", "本应用使用的 BMR 公式，被 ADA 认为对多数人最准确。"],
  ["热量缺口", "摄入 < 消耗 的差值。每天 -500 kcal ≈ 每周减 0.45 kg。"],
  ["三大营养素", "蛋白质/碳水/脂肪。本应用推荐 蛋白 1.4g/kg、脂肪 28% 热量、碳水补足。"],
  ["红绿灯规则", "🟢 蔬果/低卡蛋白可放心吃 · 🟡 主食/乳制品适量 · 🔴 零食/高卡外食/酒类少碰。"],
  ["精确值 vs 估算值", "带 ≈ 标记的营养素是按分类估算的，可在条目上手动修正（v2 起修改永久保存）。"],
  ["7 次体重趋势", "体重图画的是最近 7 次记录的原始值，建议每天早晨空腹称。"],
];

/* ---------- 状态 ---------- */
const S = {
  date: todayStr(),
  profile: null,
  meals: [],
  weights: [],
  histRange: 7,
  searchQ: "",
  pickedFood: null,
  pickedMeal: "早餐",
  ob: { step: 0, gender: "", age: "", height: "", weight: "", activity: "", goalType: "", customKcal: "" },
};

const $ = (id) => document.getElementById(id);
const el = {
  tickerInner: $("tickerInner"), dPrev: $("dPrev"), dNext: $("dNext"), dLabel: $("dLabel"),
  ringSvg: $("ringSvg"), ringFill: $("ringFill"), ringNum: $("ringNum"), ringPct: $("ringPct"),
  giantNum: $("giantNum"), asciiBar: $("asciiBar"),
  kIntake: $("kIntake"), kRest: $("kRest"), kGoal: $("kGoal"), streakChip: $("streakChip"),
  syncState: $("syncState"),
  mProt: $("mProt"), mCarb: $("mCarb"), mFat: $("mFat"),
  mProtVal: $("mProtVal"), mCarbVal: $("mCarbVal"), mFatVal: $("mFatVal"), macroNotice: $("macroNotice"),
  mealsList: $("mealsList"), emptyDay: $("emptyDay"),
  weightNow: $("weightNow"), weightDelta: $("weightDelta"), weightCanvas: $("weightCanvas"),
  histCanvas: $("histCanvas"), rangeWeek: $("rangeWeek"), rangeMonth: $("rangeMonth"),
  themeBtn: $("themeBtn"),
  addSheet: $("addSheet"), foodSearch: $("foodSearch"), foodDropdown: $("foodDropdown"),
  mealChips: $("mealChips"), qty: $("qty"), unit: $("unit"), kcal: $("kcal"),
  kcalPreview: $("kcalPreview"), addBtn: $("addBtn"),
  macroSheet: $("macroSheet"), macroEditName: $("macroEditName"),
  mEP: $("mEP"), mEC: $("mEC"), mEF: $("mEF"), saveMacroBtn: $("saveMacroBtn"),
  weightSheet: $("weightSheet"), weightInput: $("weightInput"), saveWeightBtn: $("saveWeightBtn"),
  glossarySheet: $("glossarySheet"), glossaryBody: $("glossaryBody"),
  dbSheet: $("dbSheet"), dbSearch: $("dbSearch"), dbBody: $("dbBody"),
  shareMenu: $("shareMenu"), shareStage: $("shareStage"), shareCardBox: $("shareCardBox"),
  onboard: $("onboard"), obProgress: $("obProgress"), obBody: $("obBody"),
  obBack: $("obBack"), obNext: $("obNext"), obSkip: $("obSkip"),
  toast: $("toast"),
};

/* ---------- 工具 ---------- */
function cssVarSafe(name, fallback) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback || "#999";
}

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.toast.classList.remove("show"), 2200);
}

function openSheet(id) { $(id).classList.add("open"); }
function closeSheet(id) { $(id).classList.remove("open"); }
document.querySelectorAll(".overlay").forEach((ov) => {
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.classList.remove("open"); });
});
document.querySelectorAll("[data-close]").forEach((b) => {
  b.onclick = () => closeSheet(b.dataset.close);
});

function goal() {
  return S.profile?.targetKcal || GOAL_DEFAULT;
}

function todayKcal() {
  return S.meals.reduce((s, m) => s + (m.kcal || 0), 0);
}

/* ---------- 渲染 ---------- */
function renderDate() {
  el.dLabel.textContent = dateLabel(S.date);
  el.dPrev.disabled = false;
  el.dNext.disabled = S.date >= todayStr();
}

function renderHero() {
  const intake = todayKcal(), g = goal();
  const pct = Math.min(100, Math.round((intake / g) * 100));
  // 圆环（终端/中性主题）
  const C = 2 * Math.PI * 50;
  el.ringFill.style.strokeDashoffset = String(C * (1 - Math.min(1, intake / g)));
  el.ringNum.textContent = fmt(intake);
  el.ringPct.textContent = `/ ${fmt(g)} kcal · ${pct}%`;
  // 巨型数字（粗野主题）
  el.giantNum.innerHTML = `${fmt(intake)}<span class="gunit"> / ${fmt(g)} kcal</span>`;
  // ASCII（终端主题）
  const filled = Math.round((pct / 100) * 16);
  el.asciiBar.textContent = `[${"▓".repeat(filled)}${"░".repeat(16 - filled)}] ${pct}%`;
  el.kIntake.textContent = fmt(intake);
  el.kRest.textContent = fmt(Math.max(0, g - intake));
  el.kGoal.textContent = fmt(g);
  const streak = calcStreak();
  el.streakChip.textContent = streak > 0 ? `🔥 连续记录 ${streak} 天` : "今天开始记录吧";
}

function calcStreak() {
  let n = 0, d = todayStr();
  while (n < 365) {
    const m = loadMeals(d);
    if (!m.length) break;
    n++;
    d = shiftDate(d, -1);
  }
  return n;
}

function renderMacros() {
  const targets = S.profile?.macros || calcMacros({ weight: 70, targetKcal: GOAL_DEFAULT });
  const sum = { protein: 0, carb: 0, fat: 0 };
  let hasEst = false;
  for (const m of S.meals) {
    const mac = m.macros ?? getMacros(m.name, m.kcal, m.category);
    if (mac.estimated) hasEst = true;
    sum.protein += mac.protein || 0;
    sum.carb += mac.carb || 0;
    sum.fat += mac.fat || 0;
  }
  el.mProt.style.width = Math.min(100, (sum.protein / targets.protein) * 100) + "%";
  el.mCarb.style.width = Math.min(100, (sum.carb / targets.carb) * 100) + "%";
  el.mFat.style.width = Math.min(100, (sum.fat / targets.fat) * 100) + "%";
  el.mProtVal.textContent = `${sum.protein} / ${targets.protein}g`;
  el.mCarbVal.textContent = `${sum.carb} / ${targets.carb}g`;
  el.mFatVal.textContent = `${sum.fat} / ${targets.fat}g`;
  el.macroNotice.style.display = hasEst ? "" : "none";
}

function renderMeals() {
  el.emptyDay.style.display = S.meals.length ? "none" : "";
  el.mealsList.innerHTML = "";
  for (const meal of MEAL_ORDER) {
    const items = S.meals.filter((m) => m.meal === meal);
    if (!items.length) continue;
    const sum = items.reduce((s, m) => s + (m.kcal || 0), 0);
    const group = document.createElement("div");
    group.className = "card meal-group";
    group.innerHTML = `
      <div class="meal-head"><span class="micon">${MEAL_ICONS[meal]}</span>${meal}
        <span class="sum num">${sum} kcal</span></div>
      <div class="food-list"></div>`;
    const list = group.querySelector(".food-list");
    for (const it of items) {
      const row = document.createElement("div");
      row.className = "food-row";
      const est = (it.macros ?? getMacros(it.name, it.kcal, it.category)).estimated;
      row.innerHTML = `
        <span class="tlight ${trafficColor(it)}"></span>
        <span class="food-name">${escapeHtml(it.name)}${it.qty > 1 || it.unit ? ` <span class="qty">×${it.qty}${it.unit || ""}</span>` : ""}</span>
        <button class="badge-est ${est ? "" : "precise"}" data-act="macro" title="修正营养素">${est ? "≈估" : "精确"}</button>
        <b class="food-kcal num">${it.kcal}</b>
        <button class="row-btn" data-act="del" title="删除">✕</button>`;
      row.querySelector('[data-act="macro"]').onclick = () => openMacroEdit(it.name, it.category);
      row.querySelector('[data-act="del"]').onclick = () => deleteFood(it);
      list.appendChild(row);
    }
    el.mealsList.appendChild(group);
  }
}

function renderWeight() {
  const list = S.weights;
  const now = list.length ? list[list.length - 1].value : null;
  el.weightNow.textContent = now != null ? now.toFixed(1) : "--";
  const delta = el.weightDelta;
  if (list.length >= 2) {
    const diff = list[list.length - 1].value - list[list.length - 2].value;
    delta.textContent = `${diff > 0 ? "↑" : diff < 0 ? "↓" : "—"}${Math.abs(diff).toFixed(1)}`;
    delta.className = diff <= 0 ? "delta-down" : "delta-up";
    delta.style.display = "";
  } else delta.style.display = "none";
  if (list.length >= 2) drawLine(el.weightCanvas, list);
  else {
    const ctx = el.weightCanvas.getContext("2d");
    ctx.clearRect(0, 0, el.weightCanvas.width, el.weightCanvas.height);
    ctx.fillStyle = cssVarSafe("--ink-3");
    ctx.font = "12px " + cssVarSafe("--font-num", "monospace");
    ctx.textAlign = "center";
    ctx.fillText("再记录 1 次体重即可生成趋势曲线", el.weightCanvas.clientWidth / 2, 62);
  }
}

function renderHistory() {
  const days = S.histRange;
  const bars = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = shiftDate(todayStr(), -i);
    const kcal = loadMeals(d).reduce((s, m) => s + (m.kcal || 0), 0);
    bars.push({
      label: days <= 7 ? ["日", "一", "二", "三", "四", "五", "六"][new Date(d + "T00:00:00").getDay()] : String(d.slice(8)),
      kcal,
      isToday: d === todayStr(),
    });
  }
  drawBars(el.histCanvas, bars, goal());
}

function renderAll() {
  renderDate();
  renderHero();
  renderMacros();
  renderMeals();
  renderWeight();
  renderHistory();
}

/* ---------- 日期导航 ---------- */
el.dPrev.onclick = () => { S.date = shiftDate(S.date, -1); reloadDay(); };
el.dNext.onclick = () => { if (S.date < todayStr()) { S.date = shiftDate(S.date, 1); reloadDay(); } };
function reloadDay() { S.meals = loadMeals(S.date); renderAll(); }

/* ---------- 主题切换 ---------- */
export function applySkin(skin) {
  document.body.dataset.theme = skin;
  const ICONS = { brutal: "🖥️", terminal: "🧱" };
  el.themeBtn.textContent = ICONS[skin];
}
el.themeBtn.onclick = () => {
  const next = document.body.dataset.theme === "brutal" ? "terminal" : "brutal";
  applySkin(next);
  saveSkin(next);
  showToast(next === "brutal" ? "🧱 粗野主义皮肤" : "🖥️ 复古终端皮肤");
  renderAll(); // 主题取色变化后全部重画
};

/* ---------- 添加食物 ---------- */
$("fab").onclick = () => {
  if (!S.profile) { openOnboard(); return; }
  S.pickedFood = null;
  el.foodSearch.value = "";
  el.foodDropdown.style.display = "none";
  el.qty.value = 1;
  el.kcal.value = "";
  updateKcalPreview();
  openSheet("addSheet");
  setTimeout(() => el.foodSearch.focus(), 100);
};

el.foodSearch.addEventListener("input", () => {
  S.searchQ = el.foodSearch.value;
  S.pickedFood = null;
  renderDropdown();
});
el.foodSearch.addEventListener("focus", renderDropdown);

function renderDropdown() {
  const list = search(S.searchQ);
  if (!S.searchQ.trim() || !list.length) { el.foodDropdown.style.display = "none"; return; }
  el.foodDropdown.innerHTML = list.map((f) => `
    <div class="food-opt" data-name="${escapeHtml(f.name)}">
      <span class="tlight ${trafficColor(f)}"></span>
      <span>${highlightMatch(f.name, S.searchQ)}</span>
      <span class="k num">${f.kcal}</span><span class="cat">${escapeHtml(f.category)}${f.unit ? " / " + escapeHtml(f.unit) : ""}</span>
    </div>`).join("");
  el.foodDropdown.style.display = "";
  el.foodDropdown.querySelectorAll(".food-opt").forEach((opt) => {
    opt.onclick = () => pickFood(opt.dataset.name);
  });
}

function pickFood(name) {
  S.pickedFood = dbFind(name);
  if (S.pickedFood) {
    el.kcal.value = S.pickedFood.kcal;
    if (S.pickedFood.unit) el.unit.value = S.pickedFood.unit;
  }
  updateKcalPreview();
  el.foodDropdown.style.display = "none";
}

function dbFind(name) {
  return search(name, 1).find((f) => f.name === name) || null;
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) el.foodDropdown.style.display = "none";
  if (!e.target.closest("#shareMenu") && !e.target.closest("#shareBtn")) el.shareMenu.classList.remove("open");
});

function updateKcalPreview() {
  const base = parseFloat(el.kcal.value) || 0;
  const q = parseFloat(el.qty.value) || 1;
  el.kcalPreview.innerHTML = q > 1 && base > 0
    ? `每份 <b>${base}</b> kcal × ${q} = <b>${Math.round(base * q)}</b> kcal`
    : "";
}
el.qty.addEventListener("input", updateKcalPreview);
el.kcal.addEventListener("input", updateKcalPreview);

// 餐次 chips
MEAL_ORDER.forEach((m) => {
  const b = document.createElement("button");
  b.textContent = m;
  b.dataset.meal = m;
  b.onclick = () => { S.pickedMeal = m; syncChips(); };
  el.mealChips.appendChild(b);
});
function syncChips() {
  el.mealChips.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.meal === S.pickedMeal));
}

function guessMeal() {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return "早餐";
  if (h >= 10 && h < 14) return "午餐";
  if (h >= 14 && h < 17) return "加餐";
  if (h >= 17 && h < 22) return "晚餐";
  return "加餐";
}

el.addBtn.onclick = () => {
  const name = S.pickedFood?.name || el.foodSearch.value.trim();
  const kcal = Math.round(parseFloat(el.kcal.value));
  if (!name) return showToast("先选择或输入食物名称");
  if (!kcal || kcal <= 0) return showToast("热量需要大于 0");
  const qty = Math.max(0.1, parseFloat(el.qty.value) || 1);
  const entry = {
    name, kcal: Math.round(kcal * qty), baseKcal: kcal,
    qty, unit: el.unit.value.trim(),
    meal: S.pickedMeal, confidence: S.pickedFood ? "highest" : "medium",
    date: S.date, time: new Date().toTimeString().slice(0, 5),
    category: S.pickedFood?.category || "其他",
  };
  if (S.date !== todayStr() && !confirm(`这条记录会写到 ${S.date}，确定？`)) return;
  S.meals.push(entry);
  saveMeals(S.meals, S.date);
  push(S.date);
  closeSheet("addSheet");
  renderHero(); renderMacros(); renderMeals(); renderHistory();
  showToast(`✅ ${entry.meal}「${entry.name}」+${entry.kcal} kcal`);
};

/* ---------- 删除 ---------- */
function deleteFood(it) {
  if (!confirm(`删除「${it.name}」${it.kcal} kcal？`)) return;
  const idx = S.meals.findIndex((m) => m.name === it.name && m.kcal === it.kcal && m.meal === it.meal);
  if (idx >= 0) S.meals.splice(idx, 1);
  saveMeals(S.meals, S.date);
  push(S.date);
  renderHero(); renderMacros(); renderMeals(); renderHistory();
}

/* ---------- 营养素修正（v2：持久化） ---------- */
let macroEditTarget = null;
function openMacroEdit(name, category) {
  macroEditTarget = { name, category };
  el.macroEditName.textContent = name;
  const mac = getMacros(name, null, category);
  el.mEP.value = mac.protein || "";
  el.mEC.value = mac.carb || "";
  el.mEF.value = mac.fat || "";
  openSheet("macroSheet");
}
el.saveMacroBtn.onclick = () => {
  const p = parseFloat(el.mEP.value) || 0, c = parseFloat(el.mEC.value) || 0, f = parseFloat(el.mEF.value) || 0;
  if (macroEditTarget) {
    // 持久化覆盖（修复 v1 刷新即失的 bug）
    const all = loadMacroOverrides();
    all[macroEditTarget.name] = { protein: p, carb: c, fat: f };
    localStorage.setItem("nutrition_macro_overrides", JSON.stringify(all));
    // 同步更新当日所有同名条目
    for (const m of S.meals) if (m.name === macroEditTarget.name) m.macros = { protein: p, carb: c, fat: f, estimated: false };
    saveMeals(S.meals, S.date);
    push(S.date);
    renderMacros(); renderMeals();
    showToast("✅ 营养素已修正并保存");
  }
  closeSheet("macroSheet");
};

/* ---------- 体重 ---------- */
$("weightEditBtn").onclick = () => {
  el.weightInput.value = "";
  openSheet("weightSheet");
  setTimeout(() => el.weightInput.focus(), 100);
};
el.saveWeightBtn.onclick = () => {
  const v = parseFloat(el.weightInput.value);
  if (!v || v < 20 || v > 300) return showToast("请输入 20-300 kg 之间的体重");
  S.weights = upsertWeight(S.date, v);
  saveProfileIfWeightToday(v);
  closeSheet("weightSheet");
  renderWeight();
  push(S.date);
  showToast(`⚖️ ${S.date} 体重 ${v} kg`);
};
function saveProfileIfWeightToday(v) {
  if (S.date !== todayStr() || !S.profile) return;
  S.profile.weight = v;
  saveProfile(S.profile);
}

/* ---------- 词典 / 数据库 ---------- */
$("glossaryBtn").onclick = () => {
  el.glossaryBody.innerHTML = GLOSSARY.map(([t, d]) =>
    `<div class="glossary-item"><div class="term">${t}</div><div class="def">${d}</div></div>`).join("");
  openSheet("glossarySheet");
};
$("dbBtn").onclick = () => { renderDB(""); openSheet("dbSheet"); };
el.dbSearch.addEventListener("input", () => renderDB(el.dbSearch.value));
function renderDB(q) {
  const stats = dbStats();
  let html = `<div class="db-cat">共 ${stats.total} 条食物 · ${stats.cats} 个分类${q ? ` · 匹配「${escapeHtml(q)}」` : ""}</div>`;
  if (q.trim()) {
    const hits = search(q, 60);
    html += hits.map((f) => dbRow(f)).join("") || `<div class="chart-empty">没有匹配的食物</div>`;
  } else {
    for (const [cat, items] of byCategory()) {
      html += `<div class="db-cat">${cat}</div>` + items.map((f) => dbRow(f)).join("");
    }
  }
  el.dbBody.innerHTML = html;
}
function dbRow(f) {
  return `<div class="food-row"><span class="tlight ${trafficColor(f)}"></span>
    <span class="food-name">${escapeHtml(f.name)}</span>
    <b class="food-kcal num">${f.kcal}</b>
    <span class="cat" style="font-size:10.5px;color:var(--ink-3)">${escapeHtml(f.unit || "")}</span></div>`;
}

/* ---------- 分享菜单 ---------- */
$("shareBtn").onclick = (e) => { e.stopPropagation(); el.shareMenu.classList.toggle("open"); };
$("btnShareCard").onclick = () => { el.shareMenu.classList.remove("open"); openShareStage(); };
$("btnExport").onclick = () => {
  el.shareMenu.classList.remove("open");
  const data = exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chileme-data-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("📦 数据已导出");
};
$("btnReset").onclick = async () => {
  el.shareMenu.classList.remove("open");
  if (!confirm("确定清空所有本地数据？此操作不可恢复。")) return;
  if (!confirm("再次确认：真的要清空吗？")) return;
  resetAll();
  location.reload();
};
$("stageClose").onclick = () => el.shareStage.classList.remove("open");
$("stageDownload").onclick = () => {
  window.html2canvas ? html2canvas(el.shareCardBox, { scale: 3, backgroundColor: null }).then((canvas) => {
    const a = document.createElement("a");
    a.download = `chileme-${todayStr()}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
    showToast("🖼️ 分享卡片已保存");
  }) : showToast("导出组件未加载");
};
$("stageCopy").onclick = () => {
  const g = goal(), intake = todayKcal();
  const lines = [`🍽️ 吃了么 · ${dateLabel(S.date)}`, `已摄入 ${intake} / ${g} kcal（${Math.round(intake / g * 100)}%）`];
  for (const meal of MEAL_ORDER) {
    const items = S.meals.filter((m) => m.meal === meal);
    if (!items.length) continue;
    lines.push(`${MEAL_ICONS[meal]} ${meal}（${items.reduce((s, m) => s + m.kcal, 0)} kcal）`);
    items.forEach((m) => lines.push(`  · ${m.name} ×${m.qty} ${m.kcal} kcal`));
  }
  const last = S.weights.length ? S.weights[S.weights.length - 1].value : null;
  if (last != null) lines.push(`⚖️ 体重 ${last} kg`);
  lines.push("—— 由「吃了么 v2」生成");
  navigator.clipboard.writeText(lines.join("\n")).then(() => showToast("📋 已复制文本版")).catch(() => showToast("复制失败"));
};

function openShareStage() {
  const g = goal(), intake = todayKcal();
  const pct = Math.min(100, Math.round(intake / g * 100));
  const C = 2 * Math.PI * 44;
  const dash = C * (1 - Math.min(1, intake / g));
  let mealsHtml = "";
  for (const meal of MEAL_ORDER) {
    const items = S.meals.filter((m) => m.meal === meal);
    if (!items.length) continue;
    mealsHtml += `<div class="sc-meal"><div class="sc-meal-h"><span>${MEAL_ICONS[meal]} ${meal}</span><span>${items.reduce((s, m) => s + m.kcal, 0)} kcal</span></div>${
      items.map((m) => `<div class="sc-food"><span>${escapeHtml(m.name)}${m.qty > 1 ? " ×" + m.qty : ""}</span><span>${m.kcal}</span></div>`).join("")}</div>`;
  }
  const last = S.weights.length ? S.weights[S.weights.length - 1].value : null;
  el.shareCardBox.innerHTML = `
    <div class="sc-brand"><span class="logo">吃了么</span><span class="sc-date">${dateLabel(S.date)}</span></div>
    <div class="sc-ring">
      <svg width="104" height="104" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" fill="none" stroke="#EFE4D0" stroke-width="10"/>
        <circle cx="50" cy="50" r="44" fill="none" stroke="#FF5A3C" stroke-width="10" stroke-linecap="round"
          stroke-dasharray="${C}" stroke-dashoffset="${dash}" transform="rotate(-90 50 50)"/>
        <text x="50" y="55" text-anchor="middle" font-size="18" font-weight="800" fill="#141414">${pct}%</text>
      </svg>
      <div>
        <div class="sc-big">${fmt(intake)}</div>
        <div class="sc-kcal-unit">/ ${fmt(g)} kcal</div>
        <div class="sc-stats">
          <span>剩 ${fmt(Math.max(0, g - intake))} kcal</span>
          ${last != null ? `<span>⚖️ ${last} kg</span>` : ""}
          <span>🔥 连续 ${calcStreak()} 天</span>
        </div>
      </div>
    </div>
    ${mealsHtml}
    <div class="sc-watermark">吃 了 么 V2</div>`;
  el.shareStage.classList.add("open");
}

/* ---------- 引导向导 ---------- */
function openOnboard(editing) {
  S.ob = { step: 0, ...(editing ? { ...S.profile } : { gender: "", age: "", height: "", weight: "", activity: "", goalType: "", customKcal: "" }), editing: !!editing };
  el.obBody.innerHTML = "";
  renderOnboard();
  el.onboard.classList.add("open");
}
$("profileBtn").onclick = () => openOnboard(true);
el.obSkip.onclick = () => {
  if (S.ob.editing) { el.onboard.classList.remove("open"); return; }
  S.profile = completeProfile({ gender: "male", age: 30, height: 170, weight: 65, activity: "light", goalType: "keep", skipped: true });
  saveProfile(S.profile);
  el.onboard.classList.remove("open");
  S.meals = loadMeals(S.date);
  renderAll();
  showToast("已使用默认目标，可点击右上角编辑");
};
el.obBack.onclick = () => { if (S.ob.step > 0) { S.ob.step--; renderOnboard(); } };
el.obNext.onclick = () => {
  if (!validateStep()) return;
  if (S.ob.step < 3) { S.ob.step++; renderOnboard(); return; }
  // 保存
  const p = completeProfile({
    gender: S.ob.gender, age: +S.ob.age, height: +S.ob.height, weight: +S.ob.weight,
    activity: S.ob.activity, goalType: S.ob.goalType, customKcal: +S.ob.customKcal || undefined,
  });
  S.profile = p;
  saveProfile(p);
  el.onboard.classList.remove("open");
  S.meals = loadMeals(S.date);
  renderAll();
  push(S.date);
  showToast(`🎯 每日目标 ${p.targetKcal} kcal`);
};

function validateStep() {
  const s = S.ob.step;
  if (s === 0) {
    const age = parseFloat(S.ob.age), h = parseFloat(S.ob.height), w = parseFloat(S.ob.weight);
    if (!S.ob.gender) return showToast("请选择性别"), false;
    if (!(age >= 10 && age <= 100)) return showToast("请输入 10-100 的年龄"), false;
    if (!(h >= 100 && h <= 250)) return showToast("请输入 100-250 的身高"), false;
    if (!(w >= 20 && w <= 300)) return showToast("请输入 20-300 的体重"), false;
  }
  if (s === 1 && !S.ob.activity) return showToast("请选择活动量"), false;
  if (s === 2 && !S.ob.goalType) return showToast("请选择目标"), false;
  return true;
}

function optHtml(grid, sel, list) {
  return `<div class="opt-grid ${grid}">${list.map(([v, t, d]) =>
    `<button type="button" class="opt ${sel === v ? "selected" : ""}" data-v="${v}">
       <span class="t">${t}</span>${d ? `<span class="d">${d}</span>` : ""}</button>`).join("")}</div>`;
}

function renderOnboard() {
  const s = S.ob.step;
  el.obProgress.querySelectorAll("i").forEach((b, i) => b.classList.toggle("active", i <= s));
  el.obBack.style.visibility = s === 0 ? "hidden" : "";
  el.obNext.textContent = s === 3 ? "开始使用" : "下一步";
  el.obSkip.textContent = S.ob.editing ? "取消" : "跳过";
  const ob = S.ob;
  const bind = (sel, key) => document.querySelectorAll(sel).forEach((n) => {
    n.onclick = () => { ob[key] = n.dataset.v; renderOnboard(); };
  });
  const input = (key, id) => { const n = $(id); if (n) n.oninput = () => { ob[key] = n.value; }; };

  if (s === 0) {
    el.obBody.innerHTML = `
      <h2>👋 先认识一下</h2>
      <div class="desc">这些信息帮你算出每日推荐摄入，填得越准目标越合理。</div>
      <div class="field"><label>性别</label>${optHtml("", ob.gender, [["male", "♂ 男"], ["female", "♀ 女"]])}</div>
      <div class="grid3">
        <div class="field"><label>年龄</label><input id="obAge" type="number" inputmode="numeric" placeholder="岁" value="${ob.age}"></div>
        <div class="field"><label>身高</label><input id="obHeight" type="number" inputmode="numeric" placeholder="cm" value="${ob.height}"></div>
        <div class="field"><label>体重</label><input id="obWeight" type="number" inputmode="decimal" placeholder="kg" value="${ob.weight}"></div>
      </div>
      <div class="field"><div class="hint">⚖️ 建议用今早空腹体重</div></div>`;
    bind(".opt", "gender");
    input("age", "obAge"); input("height", "obHeight"); input("weight", "obWeight");
  } else if (s === 1) {
    el.obBody.innerHTML = `
      <h2>🏃 活动量如何？</h2>
      <div class="desc">决定 BMR 之外的运动消耗系数。</div>
      ${optHtml("single", ob.activity, [
        ["sedentary", "🪑 久坐办公", "办公室工作，几乎不运动"],
        ["light", "🚶 轻度活动", "每周运动 1-3 次"],
        ["moderate", "🏃 中度活动", "每周运动 3-5 次"],
        ["active", "💪 高强度", "每周运动 6-7 次或体力劳动"],
      ])}`;
    bind(".opt", "activity");
  } else if (s === 2) {
    el.obBody.innerHTML = `
      <h2>🎯 你的目标是？</h2>
      <div class="desc">换算成每日推荐摄入量。</div>
      ${optHtml("single", ob.goalType, [
        ["lose", "📉 减脂", "TDEE − 500"],
        ["keep", "⚖️ 保持体重", "维持 TDEE"],
        ["gain", "📈 增肌", "TDEE + 300"],
        ["custom", "✍️ 自定义", "手动输入每日热量"],
      ])}
      <div id="obCustomWrap" style="display:${ob.goalType === "custom" ? "" : "none"}">
        <div class="field"><label>每日热量目标</label><input id="obCustom" type="number" placeholder="kcal" value="${ob.customKcal}"></div>
      </div>`;
    bind(".opt", "goalType");
    input("customKcal", "obCustom");
  } else {
    const preview = completeProfile({
      gender: ob.gender || "male", age: +ob.age || 30, height: +ob.height || 170, weight: +ob.weight || 65,
      activity: ob.activity || "light", goalType: ob.goalType || "keep", customKcal: +ob.customKcal || undefined,
    });
    const m = preview.macros;
    const actLabel = { sedentary: "久坐", light: "轻度", moderate: "中度", active: "高强度" }[ob.activity] || "";
    const goalLabel = { lose: "减脂", keep: "保持", gain: "增肌", custom: "自定义" }[ob.goalType] || "";
    el.obBody.innerHTML = `
      <h2>✅ 一切就绪</h2>
      <div class="desc">${actLabel}活动 · ${goalLabel}目标 · 每周预计${ob.goalType === "lose" ? "减 0.45" : ob.goalType === "gain" ? "增 0.3" : "维稳"} kg 左右</div>
      <div class="summary-box">
        <div class="big">${fmt(preview.targetKcal)}</div>
        <div class="lab">每日推荐摄入</div>
        <div class="rows">
          <span>BMR <b>${fmt(preview.bmr)}</b> · TDEE <b>${fmt(preview.tdee)}</b></span>
          <span>蛋白质 <b>${m.protein}g</b> · 碳水 <b>${m.carb}g</b> · 脂肪 <b>${m.fat}g</b></span>
        </div>
      </div>`;
  }
}

/* ---------- 同步回调 ---------- */
async function onSyncChange(dateStr) {
  if (dateStr === S.date) { S.meals = loadMeals(S.date); }
  S.weights = loadWeights();
  S.profile = loadProfile();
  renderAll();
}

/* ---------- 初始化 ---------- */
async function init() {
  // 皮肤：URL ?theme= 优先，其次存储
  const urlSkin = new URLSearchParams(location.search).get("theme");
  const skin = urlSkin === "terminal" || urlSkin === "brutal" ? urlSkin : loadSkin();
  applySkin(skin);
  el.tickerInner.textContent = "吃了么 V2 ✦ 输入食物自动算热量 ✦ 381 条食物库 ✦ 本地优先 ✦ AI 命令行同步 ✦ 双主题皮肤 ✦ ".repeat(2);

  S.profile = loadProfile();
  S.weights = loadWeights();
  S.meals = loadMeals(S.date);

  await initDB();
  await startSync(onSyncChange);

  if (!S.profile) openOnboard(false);
  renderAll();
  el.syncState.textContent = getServerOK() ? " · 服务器同步已开启" : "";

  // 跨天自动切换（60 秒检查）
  let knownDay = todayStr();
  setInterval(() => {
    if (todayStr() !== knownDay) {
      knownDay = todayStr();
      S.date = knownDay;
      reloadDay();
      showToast("🌅 新的一天开始了");
    } else {
      refreshNow(S.date); // 顺带轮询外部写入
    }
  }, 60000);

  // 图表尺寸变化重画
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderAll, 200); });
}

init();
