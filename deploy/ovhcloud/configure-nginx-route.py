#!/usr/bin/env python3
"""Install the DNI /deploy.php reverse-proxy route in matching Nginx servers."""

from __future__ import annotations

import argparse
import pathlib
import re
import sys


SERVER_START = re.compile(r"^\s*server\s*\{")
DEPLOY_LOCATION = re.compile(r"^(?P<indent>\s*)location\s*=\s*/deploy\.php\s*\{")
SERVER_NAME = re.compile(r"\bserver_name\b(?P<names>[^;]*);", re.DOTALL)
DOMAIN = re.compile(r"(?:^|\s)(?:www\.)?dreadnoughtimperium\.org(?:\s|$)")


def without_comment(line: str) -> str:
    return line.split("#", 1)[0]


def closing_line(lines: list[str], start: int) -> int:
    depth = 0
    opened = False
    for index in range(start, len(lines)):
        body = without_comment(lines[index])
        if "{" in body:
            opened = True
        depth += body.count("{") - body.count("}")
        if opened and depth == 0:
            return index
    raise ValueError(f"unclosed Nginx block beginning on line {start + 1}")


def server_blocks(lines: list[str]) -> list[tuple[int, int]]:
    blocks: list[tuple[int, int]] = []
    index = 0
    while index < len(lines):
        if SERVER_START.match(without_comment(lines[index])):
            end = closing_line(lines, index)
            blocks.append((index, end))
            index = end + 1
        else:
            index += 1
    return blocks


def handles_domain(lines: list[str], start: int, end: int) -> bool:
    block = "".join(without_comment(line) for line in lines[start : end + 1])
    return any(DOMAIN.search(match.group("names")) for match in SERVER_NAME.finditer(block))


def route_block(indent: str, port: int) -> list[str]:
    inner = f"{indent}    "
    return [
        f"{indent}# DNI automatic GitHub deployment endpoint.\n",
        f"{indent}location = /deploy.php {{\n",
        f"{inner}proxy_pass http://127.0.0.1:{port}/deploy.php;\n",
        f"{inner}proxy_http_version 1.1;\n",
        f"{inner}proxy_set_header Host $host;\n",
        f"{inner}proxy_set_header X-Real-IP $remote_addr;\n",
        f"{inner}proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n",
        f"{inner}proxy_set_header X-Forwarded-Proto $scheme;\n",
        f"{inner}proxy_connect_timeout 20s;\n",
        f"{inner}proxy_read_timeout 900s;\n",
        f"{inner}proxy_send_timeout 900s;\n",
        f'{inner}add_header Cache-Control "no-store" always;\n',
        f"{indent}}}\n",
    ]


def update_text(text: str, port: int = 8080) -> tuple[str, int]:
    lines = text.splitlines(keepends=True)
    matches = [block for block in server_blocks(lines) if handles_domain(lines, *block)]
    if not matches:
        return text, 0

    # Work backwards so earlier line offsets remain valid after each edit.
    for start, end in reversed(matches):
        existing = None
        for index in range(start + 1, end):
            match = DEPLOY_LOCATION.match(without_comment(lines[index]))
            if match:
                existing = (index, closing_line(lines, index), match.group("indent"))
                break

        if existing:
            location_start, location_end, indent = existing
            # Replace an existing route as well as its immediately preceding marker.
            replace_start = location_start
            if location_start > start + 1 and "DNI automatic GitHub deployment endpoint" in lines[location_start - 1]:
                replace_start -= 1
            lines[replace_start : location_end + 1] = route_block(indent, port)
        else:
            server_indent = re.match(r"^\s*", lines[start]).group(0)
            indent = f"{server_indent}    "
            lines[end:end] = ["\n", *route_block(indent, port)]

    return "".join(lines), len(matches)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8080, help="local DNI Node port")
    parser.add_argument("paths", nargs="+", help="Nginx configuration files to update")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    total = 0

    for raw_path in args.paths:
        path = pathlib.Path(raw_path)
        original = path.read_text(encoding="utf-8")
        updated, count = update_text(original, args.port)
        if count:
            path.write_text(updated, encoding="utf-8")
            total += count
            print(f"[bootstrap] Configured {count} matching Nginx server block(s) in {path}")

    if total == 0:
        print("No Nginx server block for dreadnoughtimperium.org was found.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
