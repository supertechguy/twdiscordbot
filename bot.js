const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const config = loadConfig();
const token = process.env.DISCORD_BOT_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;

if (!token) {
  console.error('Missing DISCORD_BOT_TOKEN environment variable.');
  process.exit(1);
}

if (!channelId) {
  console.error('Missing DISCORD_CHANNEL_ID environment variable.');
  process.exit(1);
}

if (!Array.isArray(config.games) || config.games.length === 0) {
  console.error('config.json must include a non-empty "games" array.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`Discord bot ready as ${client.user.tag}`);

  const channel = await client.channels.fetch(channelId).catch((error) => {
    console.error('Unable to fetch channel:', error);
    process.exit(1);
  });

  if (!channel || !channel.isTextBased()) {
    console.error('DISCORD_CHANNEL_ID must be a valid text channel ID.');
    process.exit(1);
  }

  startTailing(channel);
});

client.login(token).catch((error) => {
  console.error('Discord login failed:', error);
  process.exit(1);
});

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error('Missing config.json. Copy config.example.json to config.json and update the paths.');
    process.exit(1);
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error('Unable to parse config.json:', error);
    process.exit(1);
  }
}

function startTailing(channel) {
  console.log('Starting log tailing for configured game instances...');

  for (const game of config.games) {
    if (!game.name || !game.path) {
      console.warn('Skipping invalid game entry in config.json. Each entry needs a name and path.');
      continue;
    }

    const watcher = new LogWatcher(game.name, game.path, config.pollIntervalMs || 1000);
    watcher.start(channel);
  }
}

class LogWatcher {
  constructor(name, filePath, pollIntervalMs) {
    this.name = name;
    this.filePath = filePath;
    this.pollIntervalMs = pollIntervalMs;
    this.position = 0;
    this.pending = '';
    this.timer = null;
  }

  async start(channel) {
    await this.initializePosition();
    this.timer = setInterval(() => this.poll(channel).catch((error) => {
      console.error(`[${this.name}] poll error:`, error);
    }), this.pollIntervalMs);
  }

  async initializePosition() {
    try {
      const stats = await fs.promises.stat(this.filePath);
      this.position = stats.size;
      console.log(`[${this.name}] watching ${this.filePath} from ${this.position} bytes`);
    } catch (error) {
      console.warn(`[${this.name}] cannot initialize file position yet, will retry: ${error.message}`);
      this.position = 0;
    }
  }

  async poll(channel) {
    let stats;
    try {
      stats = await fs.promises.stat(this.filePath);
    } catch (error) {
      console.warn(`[${this.name}] file unavailable: ${error.message}`);
      return;
    }

    if (stats.size < this.position) {
      console.log(`[${this.name}] detected file reset/truncation; resetting position to 0`);
      this.position = 0;
      this.pending = '';
    }

    if (stats.size === this.position) {
      return;
    }

    const newData = await this.readRange(this.position, stats.size);
    this.position = stats.size;
    const lines = this.extractCompleteLines(newData);
    await this.sendLines(channel, lines);
  }

  async readRange(start, end) {
    const length = end - start;
    if (length <= 0) {
      return '';
    }

    const handle = await fs.promises.open(this.filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
      return buffer.toString('utf8');
    } finally {
      await handle.close();
    }
  }

  extractCompleteLines(data) {
    const text = this.pending + data;
    const parts = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (text.endsWith('\n') || text.endsWith('\r')) {
      this.pending = '';
      return parts.filter((line) => line.length > 0);
    }

    this.pending = parts.pop();
    return parts.filter((line) => line.length > 0);
  }

  async sendLines(channel, lines) {
    for (const line of lines) {
      const trimmed = line.trim().replace(/^\d{1,2}:\d{2}:\d{2} [AP]M \d{2}\/\d{2}\/\d{4}( [0-9A-Fa-f]{8})?\s*/, '');
      if (!trimmed) {
        continue;
      }

      const e = String.fromCharCode(27);
      const wrap = (msg) => `\`\`\`ansi\n${e}[33m[${this.name}]${e}[0m ${e}[31m${msg}${e}[0m\n\`\`\``;
      const content = wrap(trimmed);
      await channel.send(content.length > 2000 ? wrap(trimmed.slice(0, 2000 - wrap('').length - 3) + '...') : content);
    }
  }
}
