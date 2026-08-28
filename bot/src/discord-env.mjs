import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
export const BOT_ROOT = path.resolve(SRC_DIR, "..");
export const REPO_ROOT = path.resolve(BOT_ROOT, "..");

function unquote(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return text.slice(1, -1);
  }
  return text;
}

function parseEnv(raw) {
  const values = {};
  for (const rawLine of String(raw).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    values[key] = unquote(line.slice(separator + 1));
  }
  return values;
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => path.resolve(value)))];
}

export function discordEnvCandidates() {
  return unique([
    process.env.DNI_ENV_FILE,
    path.join(BOT_ROOT, ".env"),
    path.join(BOT_ROOT, "data", "dni-runtime.env"),
    path.join(REPO_ROOT, ".env"),
    path.join(REPO_ROOT, "data", "dni-runtime.env"),
    "/etc/dni-terminal/dni.env",
    "/etc/dni-discord-bot/bot.env",
    "/opt/dni-discord-bot/.env",
    "/opt/dni-terminal/bot/.env",
    "/opt/dni-terminal/data/dni-runtime.env"
  ]);
}

export async function loadDiscordEnvironment() {
  const loaded = [];
  const sources = {};

  for (const filePath of discordEnvCandidates()) {
    let raw;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "EACCES") continue;
      throw error;
    }

    const values = parseEnv(raw);
    let used = false;
    for (const [key, value] of Object.entries(values)) {
      if (!value || process.env[key]) continue;
      process.env[key] = value;
      sources[key] = filePath;
      used = true;
    }
    if (used) loaded.push(filePath);
  }

  const token = String(process.env.DISCORD_BOT_TOKEN || "").trim();
  const guildId = String(
    process.env.DISCORD_GUILD_ID || process.env.DNI_ROLE_EXPORT_GUILD_ID || process.env.DNI_DISCORD_GUILD_ID || ""
  ).trim();
  if (guildId && !process.env.DISCORD_GUILD_ID) process.env.DISCORD_GUILD_ID = guildId;

  return {
    token,
    guildId,
    loaded,
    tokenSource: sources.DISCORD_BOT_TOKEN || (token ? "process environment" : null),
    guildSource: sources.DISCORD_GUILD_ID || sources.DNI_ROLE_EXPORT_GUILD_ID || sources.DNI_DISCORD_GUILD_ID || (guildId ? "process environment" : null)
  };
}

export function describeDiscordEnvSource(source) {
  if (!source) return "not found";
  if (source === "process environment") return source;
  const relativeToBot = path.relative(BOT_ROOT, source);
  if (relativeToBot && !relativeToBot.startsWith("..")) return relativeToBot;
  return source;
}
