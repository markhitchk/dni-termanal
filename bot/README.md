# DNI Discord Role Export Bot

This folder is self-contained so the Discord bot can be copied to a Rocky Linux 9 server separately from the rest of DNI Terminal.

## Files

- `src/dni-discord-bot.mjs` — systemd bot lifecycle / `/exportroles` registration
- `src/discord-env.mjs` — discovers the bot token and guild ID from private env files
- `src/pull-discord-role-ids.mjs` — one-shot role export + DM utility
- `src/register-discord-role-export-command.mjs` — manual command registration helper
- `config/discord-role-targets.json` — approved DNI role names
- `web/interactions.php` — Discord HTTPS interaction handler
- `web/sync-discord-bot.php` — authenticated runtime-secret sync endpoint
- `systemd/dni-discord-bot.service` — Rocky 9 systemd template
- `install-rocky9.sh` — installs the service and public HTTPS wrappers

## Private configuration

Copy `.env.example` to `.env` and set the real values only on the server:

```bash
cp .env.example .env
chmod 600 .env
```

The loader checks the bot folder first, then known DNI runtime locations including `/etc/dni-terminal/dni.env` and `/opt/dni-terminal/data/dni-runtime.env`.

Never commit the real bot token.

## Rocky Linux 9 install

If the full repository is installed at `/opt/dni-terminal`, the bot is at `/opt/dni-terminal/bot`:

```bash
sudo bash /opt/dni-terminal/bot/install-rocky9.sh
```

If you copy only this folder elsewhere, run the installer from that location. Example:

```bash
sudo bash /opt/dni-discord-bot/install-rocky9.sh
```

The installer does not install packages. It uses the existing Node.js, PHP/Apache, and systemd runtime.

## Start / stop

```bash
sudo systemctl start dni-discord-bot
sudo systemctl stop dni-discord-bot
```

Logs:

```bash
sudo journalctl -u dni-discord-bot -f
```

Manual role export:

```bash
cd /opt/dni-terminal/bot
npm run roles
```
