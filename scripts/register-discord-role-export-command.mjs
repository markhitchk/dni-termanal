#!/usr/bin/env node

import process from "node:process";

const API = "https://discord.com/api/v10";
const DEFAULT_ENDPOINT = "https://www.dreadnoughtimperium.org/discord/interactions.php";

async function request(path, token, { method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "DNI-Terminal-Role-Exporter/1.0"
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

async function resolveGuildId(token) {
  const configured = String(process.env.DISCORD_GUILD_ID || process.env.DNI_DISCORD_GUILD_ID || "").trim();
  if (configured) {
    if (!/^\d{17,20}$/.test(configured)) throw new Error("Configured Discord guild ID is invalid.");
    return configured;
  }

  const guilds = await request("/users/@me/guilds", token);
  if (!Array.isArray(guilds) || guilds.length === 0) throw new Error("The bot is not installed in any Discord server.");
  if (guilds.length !== 1) {
    throw new Error("Set DNI_DISCORD_GUILD_ID because the bot is installed in multiple servers.");
  }
  return guilds[0].id;
}

async function main() {
  const token = String(process.env.DISCORD_BOT_TOKEN || "").trim();
  if (!token) throw new Error("DISCORD_BOT_TOKEN is required.");

  const endpoint = String(process.env.DNI_DISCORD_INTERACTIONS_URL || DEFAULT_ENDPOINT).trim();
  if (!/^https:\/\//i.test(endpoint)) throw new Error("DNI_DISCORD_INTERACTIONS_URL must use HTTPS.");

  const app = await request("/applications/@me", token);
  if (!app?.id) throw new Error("Unable to resolve Discord application ID.");

  const guildId = await resolveGuildId(token);

  await request("/applications/@me", token, {
    method: "PATCH",
    body: { interactions_endpoint_url: endpoint }
  });

  const command = await request(`/applications/${app.id}/guilds/${guildId}/commands`, token, {
    method: "POST",
    body: {
      name: "exportroles",
      description: "Export approved DNI role IDs to your DM",
      type: 1,
      default_member_permissions: "8"
    }
  });

  console.log(`Discord interaction endpoint: ${endpoint}`);
  console.log(`Registered /exportroles in guild ${guildId}`);
  console.log(`Command ID: ${command?.id || "unknown"}`);
}

main().catch((error) => {
  console.error(`Discord command registration failed: ${error.message}`);
  process.exitCode = 1;
});
