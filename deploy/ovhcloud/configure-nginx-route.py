#!/usr/bin/env python3
"""Compatibility loader for the legacy Nginx route helper."""
from pathlib import Path
import runpy

TARGET = Path(__file__).resolve().parents[1] / "legacy" / "nginx" / "configure-nginx-route.py"
EXPORTED = runpy.run_path(str(TARGET))
for NAME, VALUE in EXPORTED.items():
    if not NAME.startswith("__"):
        globals()[NAME] = VALUE

if __name__ == "__main__":
    raise SystemExit(globals()["main"]())
