/* ============ 图表层：Canvas 折线 + 柱状（主题感知取色） ============ */

function cssVar(name, fallback) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}

function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 130;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/** 体重折线：points = [{date, value}]，最多取最近 7 条 */
export function drawLine(canvas, points) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!points || points.length < 2) return;

  const data = points.slice(-7);
  const pad = { l: 34, r: 10, t: 14, b: 18 };
  const values = data.map((p) => p.value);
  let min = Math.min(...values), max = Math.max(...values);
  if (max - min < 0.5) { const mid = (max + min) / 2; min = mid - 0.4; max = mid + 0.4; }
  min -= 0.3; max += 0.3;

  const x = (i) => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);

  const ink = cssVar("--ink", "#222");
  const ink3 = cssVar("--ink-3", "#999");
  const accent = cssVar("--accent", "#4F7CF0");
  const line = cssVar("--line", "#eee");

  // 网格
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  for (let g = 0; g <= 2; g++) {
    const gy = pad.t + (g / 2) * (h - pad.t - pad.b);
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(w - pad.r, gy); ctx.stroke();
  }

  // 渐变填充
  const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
  grad.addColorStop(0, accent + "44");
  grad.addColorStop(1, accent + "00");
  ctx.beginPath();
  data.forEach((p, i) => i ? ctx.lineTo(x(i), y(p.value)) : ctx.moveTo(x(i), y(p.value)));
  const lastX = x(data.length - 1);
  ctx.save();
  ctx.lineTo(lastX, h - pad.b); ctx.lineTo(pad.l, h - pad.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill(); ctx.restore();

  // 折线
  ctx.beginPath();
  data.forEach((p, i) => i ? ctx.lineTo(x(i), y(p.value)) : ctx.moveTo(x(i), y(p.value)));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.stroke();

  // 点 + 首尾数值
  data.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(p.value), i === data.length - 1 ? 4 : 2.5, 0, 7);
    ctx.fillStyle = i === data.length - 1 ? accent : ink;
    ctx.fill();
  });
  ctx.fillStyle = ink3;
  ctx.font = "10px " + cssVar("--font-num", "monospace");
  ctx.textAlign = "right";
  ctx.fillText(values[values.length - 1].toFixed(1), w - pad.r, y(values[values.length - 1]) - 8);
  ctx.textAlign = "left";
  ctx.fillText(min.toFixed(1), 2, h - pad.b);
  // 日期标注
  ctx.textAlign = "left";
  ctx.fillText(data[0].date.slice(5), pad.l, h - 4);
  ctx.textAlign = "right";
  ctx.fillText(data[data.length - 1].date.slice(5), w - pad.r, h - 4);
}

/** 热量柱状：bars = [{label, kcal, isToday}]，target 虚线 */
export function drawBars(canvas, bars, target) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!bars || !bars.length) return;

  const pad = { l: 8, r: 8, t: 14, b: 18 };
  const maxV = Math.max(target * 1.1, ...bars.map((b) => b.kcal), 1);
  const n = bars.length;
  const slot = (w - pad.l - pad.r) / n;
  const bw = Math.min(18, slot * 0.6);

  const ink = cssVar("--ink", "#222");
  const ink3 = cssVar("--ink-3", "#999");
  const accent = cssVar("--accent", "#4F7CF0");
  const ring = cssVar("--ring-track", "rgba(0,0,0,.1)");

  bars.forEach((b, i) => {
    if (b.kcal <= 0) return; // 无数据不画，避免基线残段
    const bh = (b.kcal / maxV) * (h - pad.t - pad.b);
    const bx = pad.l + i * slot + (slot - bw) / 2;
    const by = h - pad.b - bh;
    if (b.isToday) {
      ctx.fillStyle = accent;
    } else {
      // 过去几天：用描线色半透明，保证任何主题下都可见
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(bx, h - pad.b);
      ctx.lineTo(bx, by + 4);
      ctx.arcTo(bx, by, bx + 4, by, 4);
      ctx.arcTo(bx + bw, by, bx + bw, by + 4, 4);
      ctx.lineTo(bx + bw, h - pad.b);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.beginPath();
    // 顶部圆角
    ctx.moveTo(bx, h - pad.b);
    ctx.lineTo(bx, by + 4);
    ctx.arcTo(bx, by, bx + 4, by, 4);
    ctx.arcTo(bx + bw, by, bx + bw, by + 4, 4);
    ctx.lineTo(bx + bw, h - pad.b);
    ctx.closePath();
    ctx.fill();
    // x 标签
    ctx.fillStyle = b.isToday ? ink : ink3;
    ctx.font = "10px " + cssVar("--font-num", "monospace");
    ctx.textAlign = "center";
    ctx.fillText(b.label, bx + bw / 2, h - 4);
  });

  // 目标虚线
  const ty = h - pad.b - (target / maxV) * (h - pad.t - pad.b);
  ctx.strokeStyle = ink3;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, ty); ctx.lineTo(w - pad.r, ty); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = ink3;
  ctx.textAlign = "right";
  ctx.fillText(String(target), w - pad.r - 2, ty - 4);
}
