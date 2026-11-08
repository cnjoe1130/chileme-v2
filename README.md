# 吃了么 v2 · chileme-v2

> 🍽️ 输入食物，自动计算热量，AI 给出饮食建议 —— 全面重设计的第二代

「吃了么」是一个**本地优先**的饮食记录工具。输入食物自动算热量、跟踪三大营养素与体重趋势、生成分享卡片。v2 从零重写了视觉与代码结构，内置 **粗野主义** 与 **复古终端** 两套可切换的完整皮肤。

## ✨ 功能

- **4 步引导**：性别 / 年龄 / 身高 / 体重 + 活动量 + 目标 → 自动计算 BMR（Mifflin-St Jeor）、TDEE 与三大营养素推荐
- **饮食记录**：381 条内置食物库搜索、四餐分组、份量与数量、红绿灯标注（🟢蔬果低卡 / 🟡主食乳品 / 🔴零食高卡）
- **营养素**：蛋/碳/脂进度条；每条目可手动覆盖宏量营养素（**v2 修复：修改会持久保存**）
- **体重趋势**：每日记录 + 最近 7 次折线图
- **热量历史**：周 / 月柱状图 + 目标虚线
- **数据玩法**：本地 localStorage 优先 + 可选本地服务器同步（3 秒轮询，多端互看）+ `sync_to_gui.py` 让 AI 在聊天里直接帮你记录
- **分享卡片**：一键生成当日战绩卡并导出 PNG
- **双主题**：🧱 粗野主义 / 🖥️ 复古终端，一键切换
- **零构建**：纯静态 HTML/CSS/JS + Python 标准库，无任何 npm 依赖

## 🚀 快速开始

### 方式一：纯静态（GitHub Pages / 直接打开）

```bash
python server.py        # 推荐：本地起服务，http://localhost:8080
# 或者直接双击 index.html（无服务器时数据仅存 localStorage）
```

### 方式二：本地同步服务器

```bash
python server.py          # 默认 8080，PORT=9090 python server.py 可改端口
# 手机连同一 Wi-Fi 访问 http://<局域网IP>:8080 即可与电脑互相同步
```

### AI 帮你记录

```bash
python sync_to_gui.py meal 番茄牛腩面 480 --meal 晚餐
python sync_to_gui.py weight 76.5
python sync_to_gui.py show
```

界面 3 秒内自动出现新记录。

## 📁 结构

```
├── index.html          落地页
├── app.html            主应用
├── assets/
│   ├── css/            tokens + 粗野/终端双主题 + 页面样式
│   └── js/             db / storage / sync / calc / charts / app 模块
├── data/               每日 JSON（meals/weights/profile），服务器模式数据
├── food-db.json        381 条食物数据库
├── server.py           本地同步服务器（双写备份 + 自动恢复）
└── sync_to_gui.py      AI 命令行写入工具
```

## 🎨 主题

| 主题 | 风格 |
|---|---|
| 🧱 粗野主义 | 粗黑描边、硬投影、巨型描边数字、滚动 ticker |
| 🖥️ 复古终端 | CRT 扫描线、荧光绿等宽字体、ASCII 图表、命令行输入 |

在应用右上角一键切换；落地页也可分别进入两种皮肤。

## 📦 数据兼容

v1（chileme）的 `data/*.json` 与 localStorage `nutrition_*` 结构完全兼容，直接拷入 `data/` 即可读取。

## License

MIT
