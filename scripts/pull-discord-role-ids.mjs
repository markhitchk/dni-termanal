#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_TARGETS = path.join(REPO_ROOT, "configs", "discord-role-targets.json");
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "data", "dni-role-ids.json");
const DEFAULT_DM_USER_ID = "1459731143472713922";
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
    throw new Error(`Duplicate target role names: ${[...new Set(duplicateTargets)].join(", ")}`);
  }

  return roles;
}

async function discordRequest(endpoint, token, { method = "GET", body } = {}) {
  const response = await fetch(`${DISCORD_API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "DNI-Terminal-Role-ID-Puller/1.1"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let parsed = null;
  const text = await response.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const detail = parsed?.message ? `: ${parsed.message}` : "";
    throw new Error(`Discord API ${response.status} ${response.statusText}${detail}`);
  }

  return parsed;
}

function chunkLines(lines, maxLength = 1850) {
  const chunks = [];
  let current = "";

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function sendRoleReport(token, userId, guild, targetRoles, roles, missing, duplicates) {
  const dmChannel = await discordRequest("/users/@me/channels", token, {
    method: "POST",
    body: { recipient_id: userId }
  });

  const lines = [
    `DNI role ID report — ${guild.name}`,
    `Server: ${guild.id}`,
    `Matched: ${Object.keys(roles).length}/${targetRoles.length}`,
    ""
  ];

  for (const roleName of targetRoles) {
    if (roles[roleName]) {
      lines.push(`${roleName}: ${roles[roleName]}`);
    } else if (duplicates[roleName]) {
      const ids = duplicates[roleName].map((entry) => entry.id).join(", ");
      lines.push(`${roleName}: DUPLICATE (${ids})`);
    } else {
      lines.push(`${roleName}: MISSING`);
    }
  }

  const chunks = chunkLines(lines);
  for (let index = 0; index < chunks.length; index += 1) {
    const prefix = chunks.length > 1 ? `Part ${index + 1}/${chunks.length}\n` : "";
    await discordRequest(`/channels/${dmChannel.id}/messages`, token, {
      method: "POST",
      body: { content: `${prefix}${chunks[index]}` }
    });
  }
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("This script requires Node.js 20 or newer.");
  }

  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = (readArg("--guild") || process.env.DISCORD_GUILD_ID || "").trim();
  const dmUserId = (readArg("--dm-user") || process.env.DISCORD_DM_USER_ID || DEFAULT_DM_USER_ID).trim();
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

  if (!/^\d{17,20}$/.test(dmUserId)) {
    throw new Error("Discord DM user ID does not look valid.");
  }

  const targetRoles = await loadTargetRoles(targetsPath);

  const [guild, serverRoles] = await Promise.all([
    discordRequest(`/guilds/${guildId}`, token),
    discordRequest(`/guilds/${guildId}/roles`, token)
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

  await sendRoleReport(token, dmUserId, guild, targetRoles, roles, missing, duplicates);
  console.log(`Discord report sent to user ${dmUserId}`);

  if (missing.length || Object.keys(duplicates).length) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`Role ID pull failed: ${error.message}`);
  process.exitCode = 1;
});
