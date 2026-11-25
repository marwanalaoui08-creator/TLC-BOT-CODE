import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { tlcSlashCommands } from './commands/definitions.ts';

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error('DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID must be configured in environment variables.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

async function deploy() {
  try {
    console.log(`Deploying ${tlcSlashCommands.length} unique TLC slash commands...`);
    if (guildId) {
      // Clear global commands so Discord never shows duplicate Global + Guild commands
      await rest.put(Routes.applicationCommands(clientId!), { body: [] });
      await rest.put(Routes.applicationGuildCommands(clientId!, guildId), {
        body: tlcSlashCommands,
      });
      console.log(`Registered guild commands for guild ${guildId} (cleared global duplicates).`);
    } else {
      await rest.put(Routes.applicationCommands(clientId!), {
        body: tlcSlashCommands,
      });
      console.log('Registered global application commands.');
    }
  } catch (error) {
    console.error('Failed to deploy slash commands:', error);
    process.exit(1);
  }
}

deploy();
