"""启动入口：python -m app.server

会在 127.0.0.1:8899 同时提供 API 和静态网站。
"""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from fastapi.staticfiles import StaticFiles

from .api import app

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
if WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")

HOST = os.getenv("MATH_HOST", "127.0.0.1")
PORT = int(os.getenv("MATH_PORT", "8899"))


def main() -> None:
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
