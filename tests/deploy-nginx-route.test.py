#!/usr/bin/env python3
"""Regression checks for the bootstrap's Nginx route installer."""

from __future__ import annotations

import importlib.util
import pathlib


ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "deploy" / "ovhcloud" / "configure-nginx-route.py"
SPEC = importlib.util.spec_from_file_location("configure_nginx_route", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


SOURCE = """\
server {
    listen 80;
    server_name dreadnoughtimperium.org www.dreadnoughtimperium.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name
        dreadnoughtimperium.org
        www.dreadnoughtimperium.org;

    location = /deploy.php {
        return 404;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}

server {
    listen 80 default_server;
    server_name unrelated.example;
}
"""


updated, count = MODULE.update_text(SOURCE, 8123)
assert count == 2, f"expected two domain server blocks, got {count}"
assert updated.count("location = /deploy.php") == 2
assert updated.count("proxy_pass http://127.0.0.1:8123/deploy.php;") == 2
assert "return 404;" not in updated
assert "server_name unrelated.example;\n}" in updated

second, second_count = MODULE.update_text(updated, 8123)
assert second_count == 2
assert second == updated, "route installation must be idempotent"

print("DNI Nginx deployment-route regression checks passed.")
