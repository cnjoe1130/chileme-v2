/* ============ 计算层：BMR / TDEE / 营养素（与 v1 公式一致） ============ */
export const ACTIVITY_MULT = {
  sedentary: { mult: 1.2, label: "久坐办公" },
  light: { mult: 1.375, label: "轻度活动" },
  moderate: { mult: 1.55, label: "中度活动" },
  active: { mult: 1.725, label: "高强度" },
};

export const GOAL_OFFSET = { lose: -500, keep: 0, gain: 300, custom: 0 };

/** Mifflin-St Jeor */
export function calcBMR(p) {
  const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  return Math.round(p.gender === "male" ? base + 5 : base - 161);
}

export function calcTDEE(p) {
  return Math.round(calcBMR(p) * (ACTIVITY_MULT[p.activity]?.mult ?? 1.2));
}

export function calcTargetKcal(p) {
  if (p.goalType === "custom") return Math.round(p.customKcal ?? p.tdee);
  return Math.max(1200, Math.round(p.tdee + (GOAL_OFFSET[p.goalType] ?? 0)));
}

/** 蛋白 1.4g/kg、脂肪 28% 热量、碳水余量（与 v1 一致） */
export function calcMacros(p) {
  const protein = Math.round(p.weight * 1.4);
  const fat = Math.round((p.targetKcal * 0.28) / 9);
  const carb = Math.round(Math.max(0, (p.targetKcal - protein * 4 - fat * 9) / 4));
  return { protein, carb, fat };
}

export function completeProfile(input) {
  const p = { ...input };
  p.bmr = calcBMR(p);
  p.tdee = calcTDEE(p);
  p.targetKcal = calcTargetKcal(p);
  p.macros = calcMacros(p);
  return p;
}

export function fmt(n) {
  return Number(n).toLocaleString("en-US");
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
}

export function shiftDate(iso, delta) {
  // 注意：不能用 toISOString()（UTC），否则在 UTC+ 时区会偏移一天
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
