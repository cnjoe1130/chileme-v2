#!/usr/bin/env python3
"""吃了么 v2 — 本地数据同步服务器

接口与 v1 (chileme/server.py) 完全兼容：
  GET    /data/<date>.json     读取当日数据（缺失时自动从备份恢复）
  PUT    /data/<date>.json     写入当日数据（主目录 + 隐藏备份双写）
  POST   /data/<date>.json     同 PUT
  DELETE /data/<date>.json     删除当日数据（两处都删）
  POST   /api/recover          把备份目录中主目录缺失的文件全部拷回
  GET    /api/backup/status    查看主/备两侧文件清单
  GET    /                     落地页 index.html

双写目录：
  ./data/                        仓库内主数据
  ~/.chileme-v2/data/            用户目录隐藏备份
"""
import json
import os
import shutil
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
BACKUP_DIR = os.path.join(os.path.expanduser("~"), ".chileme-v2", "data")
PORT = int(os.environ.get("PORT", "8080"))

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)


def _safe_name(name: str) -> bool:
    return bool(name) and all(c not in name for c in "/\\") and name.endswith(".json") and not name.startswith(".")


class Handler(SimpleHTTPRequestHandler):
    # 始终以仓库根为静态根
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _send(self, code, body=b"", ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _send_json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    # ---------- CORS 预检 ----------
    def do_OPTIONS(self):
        self._send(204)

    # ---------- 数据文件路径 ----------
    def _data_path(self):
        name = self.path.split("?", 1)[0].lstrip("/")
        if not name.startswith("data/"):
            return None
        fname = name[len("data/"):]
        if not _safe_name(fname):
            return None
        return fname

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/backup/status":
            main = sorted(os.listdir(DATA_DIR)) if os.path.isdir(DATA_DIR) else []
            back = sorted(os.listdir(BACKUP_DIR)) if os.path.isdir(BACKUP_DIR) else []
            return self._send_json(200, {"main": main, "backup": back})

        fname = self._data_path()
        if fname:
            main_file = os.path.join(DATA_DIR, fname)
            back_file = os.path.join(BACKUP_DIR, fname)
            # 主文件缺失 → 自动从备份恢复
            if not os.path.exists(main_file) and os.path.exists(back_file):
                shutil.copy2(back_file, main_file)
            src = main_file if os.path.exists(main_file) else back_file
            if os.path.exists(src):
                with open(src, "rb") as f:
                    return self._send(200, f.read())
            return self._send_json(200, {"meals": [], "weights": [], "profile": {}})

        # 根路径 → 落地页
        if path in ("/", "/index.html"):
            self.path = "/index.html"
        return super().do_GET()

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    def _dual_write(self, fname, obj):
        payload = json.dumps(obj, ensure_ascii=False, indent=1).encode("utf-8")
        for d in (DATA_DIR, BACKUP_DIR):
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, fname), "wb") as f:
                f.write(payload)

    def do_PUT(self):
        fname = self._data_path()
        obj = self._read_body()
        if not fname or obj is None:
            return self._send_json(400, {"error": "bad request"})
        self._dual_write(fname, obj)
        self._send_json(200, {"ok": True})

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/recover":
            count = 0
            if os.path.isdir(BACKUP_DIR):
                for fname in os.listdir(BACKUP_DIR):
                    if not _safe_name(fname):
                        continue
                    dst = os.path.join(DATA_DIR, fname)
                    if not os.path.exists(dst):
                        shutil.copy2(os.path.join(BACKUP_DIR, fname), dst)
                        count += 1
            return self._send_json(200, {"recovered": count})
        if path.startswith("/data/"):
            return self.do_PUT()
        self._send_json(404, {"error": "not found"})

    def do_DELETE(self):
        fname = self._data_path()
        if not fname:
            return self._send_json(400, {"error": "bad request"})
        for d in (DATA_DIR, BACKUP_DIR):
            p = os.path.join(d, fname)
            if os.path.exists(p):
                os.remove(p)
        self._send_json(200, {"ok": True})

    def log_message(self, fmt, *args):  # 安静一点
        pass


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


if __name__ == "__main__":
    print(f"🍽️ 吃了么 v2 服务器: http://localhost:{PORT}  (局域网 http://{lan_ip()}:{PORT})")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
