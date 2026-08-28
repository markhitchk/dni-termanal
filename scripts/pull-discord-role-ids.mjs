#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_TARGETS = path.join(REPO_ROOT, "configs", "discord-role-targets.json");
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "data", "dni-role-ids.json");
const DISCORD_API = "https://discord.com/api/v10";

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function displayPath(filePath) {
  const relative = path.relative(REPO_ROOT, filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}

async function loadTargetRoles(filePath) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed.roles) || parsed.roles.length === 0) {
    throw new Error(`${displayPath(filePath)} must contain a non-empty \"roles\" array`);
  }

  const roles = parsed.roles.map((role) => String(role).trim()).filter(Boolean);
  const duplicateTargets = roles.filter((role, index) => roles.indexOf(role) !== index);

  if (duplicateTargets.length) {
    throw new Error(
      `Duplicate target role names: ${[...new Set(duplicateTargets)].join(", ")}`
    );
  }

  return roles;
}

async function discordGet(endpoint, token) {
  const response = await fetch(`${DISCORD_API}${endpoint}`, {
    headers: {
      Authorization: `Bot ${token}`,
      Accept: "application/json",
      "User-Agent": "DNI-Terminal-Role-ID-Puller/1.0"
    }
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.message ? `: ${body.message}` : "";
    } catch {
      // Discord may return an empty/non-JSON response in some failure cases.
    }

    throw new Error(`Discord API ${response.status} ${response.statusText}${detail}`);
  }

  return response.json();
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("This script requires Node.js 20 or newer.");
  }

  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = (readArg("--guild") || process.env.DISCORD_GUILD_ID || "").trim();
  const targetsPath = path.resolve(readArg("--targets") || DEFAULT_TARGETS);
  const outputPath = path.resolve(readArg("--output") || DEFAULT_OUTPUT);

  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required. Keep the bot token out of Git/GitHub.");
  }

  if (!guildId) {
    throw new Error("DISCORD_GUILD_ID is required, or pass --guild <server-id>.");
  }

  if (!/^\d{17,20}$/.test(guildId)) {
    throw new Error("DISCORD_GUILD_ID does not look like a valid Discord server ID.");
  }

  const targetRoles = await loadTargetRoles(targetsPath);

  const [guild, serverRoles] = await Promise.all([
    discordGet(`/guilds/${guildId}`, token),
    discordGet(`/guilds/${guildId}/roles`, token)
  ]);

  const byName = new Map();
  for (const role of serverRoles) {
    const current = byName.get(role.name) || [];
    current.push(role);
    byName.set(role.name, current);
  }

  const roles = {};
  const missing = [];
  const duplicates = {};

  for (const targetName of targetRoles) {
    const matches = byName.get(targetName) || [];

    if (matches.length === 0) {
      missing.push(targetName);
      continue;
    }

    if (matches.length > 1) {
      duplicates[targetName] = matches
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ id: role.id, position: role.position }));
      continue;
    }

    roles[targetName] = matches[0].id;
  }

  const result = {
    generatedAt: new Date().toISOString(),
    guild: {
      id: guild.id,
      name: guild.name
    },
    requestedRoleCount: targetRoles.length,
    matchedRoleCount: Object.keys(roles).length,
    roles,
    missing,
    duplicates
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  console.log(`DNI Discord roles for ${guild.name} (${guild.id})`);
  console.log("=".repeat(72));

  for (const roleName of targetRoles) {
    if (roles[roleName]) {
      console.log(`${roleName.padEnd(38)} ${roles[roleName]}`);
    } else if (duplicates[roleName]) {
      console.log(`${roleName.padEnd(38)} DUPLICATE NAME`);
      for (const entry of duplicates[roleName]) {
        console.log(`${"".padEnd(40)}${entry.id} (position ${entry.position})`);
      }
    } else {
      console.log(`${roleName.padEnd(38)} MISSING`);
    }
  }

  console.log("=".repeat(72));
  console.log(`Requested: ${targetRoles.length}`);
  console.log(`Matched:   ${Object.keys(roles).length}`);
  console.log(`Missing:   ${missing.length}`);
  console.log(`Duplicate: ${Object.keys(duplicates).length}`);
  console.log(`Saved:     ${displayPath(outputPath)}`);

  if (missing.length || Object.keys(duplicates).length) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`Role ID pull failed: ${error.message}`);
  process.exitCode = 1;
});
