# TW Discord Bot

Discord bot for Windows Server that tails Trade Wars 2002 server log files and posts each new line into a Discord channel with the originating game name.

## Setup

1. Install Node.js 18+ on Windows Server.
2. Copy `config.example.json` to `config.json` and update the `path` values for your game instances.
3. Create a `.env` file from `.env.example` and set:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_CHANNEL_ID`
4. Install dependencies:

```bash
npm install
```

## Run

```bash
npm start
```

## Adding more game logs

Add new objects to the `games` array in `config.json` with a unique `name` and the full Windows path to the `TWGame.LOG` file.

Example:

```json
{
  "name": "GameD",
  "path": "C:\\Program Files (x86)\\EIS\\TWGS\\Game\\GameD\\TWGame.LOG"
}
```

## Notes

- The bot polls each log file every second by default.
- It only sends new complete lines to Discord, and it includes the game name in every message.
- If a log file resets or is truncated, the bot automatically resets its read position.
