#!/usr/bin/env python3
"""吃了么 v2 — AI 命令行写入工具

让 AI 助手 / 脚本直接写入饮食数据，GUI 界面 3 秒内轮询显示：
  python sync_to_gui.py meal 番茄牛腩面 480 --meal 晚餐 --qty 1 --unit 碗 [--date 2026-11-08]
  python sync_to_gui.py weight 76.5 [--date 2026-11-08]
  python sync_to_gui.py delete 番茄牛腩面 [--date 2026-11-08]
  python sync_to_gui.py show [--date 2026-11-08]
  python sync_to_gui.py recover          # 备份恢复
  python sync_to_gui.py status           # 主/备对比
数据格式与 server.py 双写逻辑一致（data/ + ~/.chileme-v2/data/）。
"""
import argparse
import json
import os
import shutil
import sys
from datetime import date, datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
BACKUP_DIR = os.path.join(os.path.expanduser("~"), ".chileme-v2", "data")
EMPTY = {"meals": [], "weights": [], "profile": {}}


def today():
    return date.today().isoformat()


def load(dname: str):
    fname = os.path.join(DATA_DIR, f"{dname}.json")
    if not os.path.exists(fname):
        fname = os.path.join(BACKUP_DIR, f"{dname}.json")
    if os.path.exists(fname):
        try:
            with open(fname, encoding="utf-8") as f:
                data = json.load(f)
        except (ValueError, OSError):
            data = dict(EMPTY)
        for k in EMPTY:
            data.setdefault(k, json.loads(json.dumps(EMPTY[k])))
        return data
    return json.loads(json.dumps(EMPTY))


def save(dname: str, data):
    payload = json.dumps(data, ensure_ascii=False, indent=1)
    for d in (DATA_DIR, BACKUP_DIR):
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, f"{dname}.json"), "w", encoding="utf-8") as f:
            f.write(payload)


def cmd_meal(a):
    dname = a.date or today()
    data = load(dname)
    entry = {
        "name": a.name,
        "kcal": a.kcal,
        "baseKcal": a.kcal,
        "qty": a.qty or 1,
        "unit": a.unit or "",
        "meal": a.meal or guess_meal(),
        "confidence": a.confidence or "medium",
        "date": dname,
        "time": datetime.now().strftime("%H:%M"),
    }
    data["meals"].append(entry)
    save(dname, data)
    print(f"✅ 已记录 {entry['meal']}「{entry['name']}」{entry['kcal']} kcal @ {dname} "
          f"（界面 3 秒内同步）")


def guess_meal():
    h = datetime.now().hour
    if 5 <= h < 10:
        return "早餐"
    if 10 <= h < 14:
        return "午餐"
    if 14 <= h < 17:
        return "加餐"
    if 17 <= h < 22:
        return "晚餐"
    return "加餐"


def cmd_weight(a):
    dname = a.date or today()
    data = load(dname)
    if not (20 <= a.kg <= 300):
        sys.exit("❌ 体重需在 20-300 kg 之间")
    data["weights"] = [w for w in data["weights"] if w.get("date") != dname]
    data["weights"].append({"date": dname, "value": a.kg})
    data["weights"].sort(key=lambda w: w.get("date", ""))
    save(dname, data)
    print(f"✅ 已记录体重 {a.kg} kg @ {dname}")


def cmd_delete(a):
    dname = a.date or today()
    data = load(dname)
    before = len(data["meals"])
    data["meals"] = [m for m in data["meals"] if m.get("name") != a.name]
    save(dname, data)
    print(f"🗑️ 删除 {before - len(data['meals'])} 条「{a.name}」@ {dname}")


def cmd_show(a):
    dname = a.date or today()
    data = load(dname)
    total = sum(m.get("kcal", 0) for m in data["meals"])
    print(f"📅 {dname}  共 {len(data['meals'])} 项 / {total} kcal")
    for m in data["meals"]:
        print(f"  {m.get('time','--:--')} {m.get('meal',''):<3} {m.get('name','')}"
              f" ×{m.get('qty',1)}  {m.get('kcal',0)} kcal")
    for w in data["weights"]:
        if w.get("date") == dname:
            print(f"  ⚖️ 体重 {w.get('value')} kg")


def cmd_recover(_):
    count = 0
    for fname in os.listdir(BACKUP_DIR):
        dst = os.path.join(DATA_DIR, fname)
        if fname.endswith(".json") and not os.path.exists(dst):
            shutil.copy2(os.path.join(BACKUP_DIR, fname), dst)
            count += 1
    print(f"♻️ 恢复 {count} 个文件")


def cmd_status(_):
    main = set(os.listdir(DATA_DIR)) if os.path.isdir(DATA_DIR) else set()
    back = set(os.listdir(BACKUP_DIR)) if os.path.isdir(BACKUP_DIR) else set()
    print(f"主目录 {len(main)} 个 | 备份 {len(back)} 个")
    only_b = back - main
    if only_b:
        print("仅存在于备份（可用 recover 恢复）:", ", ".join(sorted(only_b)))


def main():
    p = argparse.ArgumentParser(description="吃了么 v2 数据写入工具")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("meal", help="记录一餐")
    sp.add_argument("name")
    sp.add_argument("kcal", type=int)
    sp.add_argument("--meal", dest="meal", help="餐次：早餐/午餐/晚餐/加餐")
    sp.add_argument("--qty", type=float)
    sp.add_argument("--unit")
    sp.add_argument("--date")
    sp.add_argument("--confidence", choices=["highest", "medium"])

    sp = sub.add_parser("weight", help="记录体重")
    sp.add_argument("kg", type=float)
    sp.add_argument("--date")

    sp = sub.add_parser("delete", help="按名称删除")
    sp.add_argument("name")
    sp.add_argument("--date")

    sp = sub.add_parser("show", help="查看当日")
    sp.add_argument("--date")

    sub.add_parser("recover", help="备份恢复")
    sub.add_parser("status", help="主/备对比")

    args = p.parse_args()
    {"meal": cmd_meal, "weight": cmd_weight, "delete": cmd_delete,
     "show": cmd_show, "recover": cmd_recover, "status": cmd_status}[args.cmd](args)


if __name__ == "__main__":
    main()
