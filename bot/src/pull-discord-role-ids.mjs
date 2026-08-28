#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { BOT_ROOT, loadDiscordEnvironment } from "./discord-env.mjs";

const DEFAULT_TARGETS = path.join(BOT_ROOT, "config", "discord-role-targets.json");
const DEFAULT_OUTPUT = path.join(BOT_ROOT, "data", "dni-role-ids.json");
const DEFAULT_DM_USER_ID = "1459731143472713922";
const DISCORD_API = "https://discord.com/api/v10";

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function loadTargetRoles(filePath) {
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(parsed.roles) || parsed.roles.length === 0) throw new Error(`${filePath} must contain a non-empty roles array`);
  const roles = parsed.roles.map((role) => String(role).trim()).filter(Boolean);
  const duplicates = roles.filter((role, index) => roles.indexOf(role) !== index);
  if (duplicates.length) throw new Error(`Duplicate target role names: ${[...new Set(duplicates)].join(", ")}`);
  return roles;
}

async function discordRequest(endpoint, token, { method = "GET", body } = {}) {
  const response = await fetch(`${DISCORD_API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "DNI-Terminal-Role-ID-Puller/2.0"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  if (text) { try { parsed = JSON.parse(text); } catch {} }
  if (!response.ok) throw new Error(`Discord API ${response.status} ${response.statusText}${parsed?.message ? `: ${parsed.message}` : ""}`);
  return parsed;
}

async function resolveGuildId(token, configuredGuildId) {
  if (configuredGuildId) {
    if (!/^\d{17,20}$/.test(configuredGuildId)) throw new Error("Configured Discord guild ID is invalid.");
    return configuredGuildId;
  }
  const guilds = await discordRequest("/users/@me/guilds", token);
  if (!Array.isArray(guilds) || guilds.length === 0) throw new Error("The Discord bot is not currently in any servers.");
  if (guilds.length !== 1) throw new Error("Set a guild ID in .env because the bot belongs to multiple servers.");
  return guilds[0].id;
}

function chunkLines(lines, maxLength = 1850) {
  const chunks = [];
  let current = "";
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLength && current) { chunks.push(current); current = line; }
    else current = candidate;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function sendRoleReport(token, userId, guild, targetRoles, roles, missing, duplicates) {
  const dm = await discordRequest("/users/@me/channels", token, { method: "POST", body: { recipient_id: userId } });
  const lines = [`DNI role ID report — ${guild.name}`, `Server: ${guild.id}`, `Matched: ${Object.keys(roles).length}/${targetRoles.length}`, ""];
  for (const roleName of targetRoles) {
    if (roles[roleName]) lines.push(`${roleName}: ${roles[roleName]}`);
    else if (duplicates[roleName]) lines.push(`${roleName}: DUPLICATE (${duplicates[roleName].map((entry) => entry.id).join(", ")})`);
    else lines.push(`${roleName}: MISSING`);
  }
  const chunks = chunkLines(lines);
  for (let index = 0; index < chunks.length; index += 1) {
    const prefix = chunks.length > 1 ? `Part ${index + 1}/${chunks.length}\n` : "";
    await discordRequest(`/channels/${dm.id}/messages`, token, { method: "POST", body: { content: `${prefix}${chunks[index]}` } });
  }
}

async function main() {
  const env = await loadDiscordEnvironment();
  const token = env.token;
  if (!token) throw new Error("DISCORD_BOT_TOKEN was not found in the bot/DNI .env locations.");

  const configuredGuildId = String(readArg("--guild") || env.guildId || "").trim();
  const dmUserId = String(readArg("--dm-user") || process.env.DISCORD_DM_USER_ID || DEFAULT_DM_USER_ID).trim();
  if (!/^\d{17,20}$/.test(dmUserId)) throw new Error("Discord DM user ID does not look valid.");

  const targetsPath = path.resolve(readArg("--targets") || DEFAULT_TARGETS);
  const outputPath = path.resolve(readArg("--output") || DEFAULT_OUTPUT);
  const guildId = await resolveGuildId(token, configuredGuildId);
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
    if (matches.length === 0) missing.push(targetName);
    else if (matches.length > 1) duplicates[targetName] = matches.sort((a, b) => b.position - a.position).map((role) => ({ id: role.id, position: role.position }));
    else roles[targetName] = matches[0].id;
  }

  const result = {
    generatedAt: new Date().toISOString(),
    guild: { id: guild.id, name: guild.name },
    requestedRoleCount: targetRoles.length,
    matchedRoleCount: Object.keys(roles).length,
    roles,
    missing,
    duplicates
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await sendRoleReport(token, dmUserId, guild, targetRoles, roles, missing, duplicates);

  console.log(`DNI Discord roles: ${Object.keys(roles).length}/${targetRoles.length} matched for ${guild.name}`);
  console.log(`Saved: ${outputPath}`);
  console.log(`DM sent to Discord user ${dmUserId}`);
  if (missing.length || Object.keys(duplicates).length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Role ID pull failed: ${error.message}`);
  process.exitCode = 1;
});
