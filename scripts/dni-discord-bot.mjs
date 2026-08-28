#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { describeDiscordEnvSource, loadDiscordEnvironment } from "./discord-env.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const STATE_FILE = path.join(REPO_ROOT, "data", "dni-discord-bot.state.json");
const API = "https://discord.com/api/v10";
const DEFAULT_ENDPOINT = "https://www.dreadnoughtimperium.org/discord/interactions.php";
const HEARTBEAT_MS = 30000;

async function request(apiPath, token, { method = "GET", body } = {}) {
  const response = await fetch(`${API}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "DNI-Terminal-Discord-Bot-Service/1.0"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = null; }
  }

  if (!response.ok) {
    const detail = parsed?.message ? `: ${parsed.message}` : "";
    throw new Error(`Discord API ${response.status} ${response.statusText}${detail}`);
  }

  return parsed;
}

async function resolveGuildId(token, configuredGuildId) {
  if (configuredGuildId) {
    if (!/^\d{17,20}$/.test(configuredGuildId)) {
      throw new Error("Configured Discord guild ID is invalid.");
    }
    return configuredGuildId;
  }

  const guilds = await request("/users/@me/guilds", token);
  if (!Array.isArray(guilds) || guilds.length === 0) {
    throw new Error("The Discord bot is not installed in any servers.");
  }
  if (guilds.length !== 1) {
    throw new Error("Guild ID was not found in an env file and the bot belongs to multiple servers. Set DISCORD_GUILD_ID, DNI_ROLE_EXPORT_GUILD_ID, or DNI_DISCORD_GUILD_ID.");
  }
  return String(guilds[0].id);
}

async function writeState(state) {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("Node.js 20 or newer is required.");
  }

  const env = await loadDiscordEnvironment();
  if (!env.token) {
    throw new Error(`DISCORD_BOT_TOKEN was not found. Checked process environment and: ${env.loaded.length ? env.loaded.map(describeDiscordEnvSource).join(", ") : "known DNI .env locations"}.`);
  }

  console.log(`[DNI Discord] Token source: ${describeDiscordEnvSource(env.tokenSource)}`);
  if (env.guildSource) {
    console.log(`[DNI Discord] Guild source: ${describeDiscordEnvSource(env.guildSource)}`);
  }

  const guildId = await resolveGuildId(env.token, env.guildId);
  const endpoint = String(process.env.DNI_DISCORD_INTERACTIONS_URL || DEFAULT_ENDPOINT).trim();
  if (!/^https:\/\//i.test(endpoint)) {
    throw new Error("DNI_DISCORD_INTERACTIONS_URL must use HTTPS.");
  }

  const application = await request("/applications/@me", env.token);
  const applicationId = String(application?.id || "").trim();
  if (!/^\d{17,20}$/.test(applicationId)) {
    throw new Error("Discord application ID could not be resolved.");
  }

  await request("/applications/@me", env.token, {
    method: "PATCH",
    body: { interactions_endpoint_url: endpoint }
  });

  const command = await request(`/applications/${applicationId}/guilds/${guildId}/commands`, env.token, {
    method: "POST",
    body: {
      name: "exportroles",
      description: "Export approved DNI role IDs to your DM",
      type: 1,
      default_member_permissions: "8"
    }
  });

  const commandId = String(command?.id || "").trim();
  if (!commandId) {
    throw new Error("Discord did not return an /exportroles command ID.");
  }

  const startedAt = new Date().toISOString();
  let stopping = false;

  const state = () => ({
    active: !stopping,
    pid: process.pid,
    applicationId,
    guildId,
    commandId,
    interactionsEndpoint: endpoint,
    startedAt,
    updatedAt: new Date().toISOString()
  });

  await writeState(state());
  console.log(`[DNI Discord] /exportroles registered in guild ${guildId}`);
  console.log(`[DNI Discord] Bot service active as PID ${process.pid}`);

  const heartbeat = setInterval(() => {
    writeState(state()).catch((error) => {
      console.error(`[DNI Discord] State heartbeat failed: ${error.message}`);
    });
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeat);
    console.log(`[DNI Discord] ${signal} received; stopping bot service.`);

    try {
      await request(`/applications/${applicationId}/guilds/${guildId}/commands/${commandId}`, env.token, {
        method: "DELETE"
      });
      console.log("[DNI Discord] /exportroles removed from the server.");
    } catch (error) {
      console.error(`[DNI Discord] Unable to remove /exportroles during shutdown: ${error.message}`);
    }

    try {
      await writeState({ ...state(), active: false, stoppedAt: new Date().toISOString() });
    } catch (error) {
      console.error(`[DNI Discord] Unable to record stopped state: ${error.message}`);
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => { shutdown("SIGTERM"); });
  process.on("SIGINT", () => { shutdown("SIGINT"); });

  // Keep the systemd service alive. Discord interactions themselves are delivered
  // to the HTTPS endpoint above; this service owns command registration/lifecycle.
  setInterval(() => {}, 60 * 60 * 1000);
}

main().catch(async (error) => {
  console.error(`[DNI Discord] Bot service failed: ${error.message}`);
  try {
    await writeState({
      active: false,
      pid: process.pid,
      error: error.message,
      updatedAt: new Date().toISOString()
    });
  } catch {
    // Best-effort state only.
  }
  process.exitCode = 1;
});
