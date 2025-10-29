const { Client, GatewayIntentBits, Collection, Events, ActivityType } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.commands = new Collection();
client.cooldowns = new Collection();
client.config = require('./config.json');

const loadCommands = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      loadCommands(filePath);
    } else if (file.endsWith('.js')) {
      const command = require(filePath);
      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded command: ${command.data.name}`);
      }
    }
  }
};

loadCommands(path.join(__dirname, 'commands'));

const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`✅ Loaded event: ${event.name}`);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`🥝 ${client.user.tag} is online!`);
  console.log(`📊 Serving ${client.guilds.cache.size} servers`);
  
  client.user.setActivity('Made by Pixel Beast 🍃', { type: ActivityType.Playing });

  if (process.env.MONGO_URI && process.env.MONGO_URI !== 'your_mongodb_uri_here') {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('✅ Connected to MongoDB');
    } catch (error) {
      console.log('⚠️ MongoDB not connected, using JSON database');
    }
  }

  const commands = client.commands.map(cmd => cmd.data.toJSON());
  try {
    await client.application.commands.set(commands);
    console.log(`✅ Registered ${commands.length} slash commands globally`);
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  const { cooldowns } = client;
  if (!cooldowns.has(command.data.name)) {
    cooldowns.set(command.data.name, new Collection());
  }

  const now = Date.now();
  const timestamps = cooldowns.get(command.data.name);
  const cooldownAmount = (command.cooldown || 3) * 1000;

  if (timestamps.has(interaction.user.id)) {
    const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
    if (now < expirationTime) {
      const timeLeft = (expirationTime - now) / 1000;
      return interaction.reply({
        content: `⏳ Please wait ${timeLeft.toFixed(1)} more seconds before using \`${command.data.name}\` again.`,
        ephemeral: true
      });
    }
  }

  timestamps.set(interaction.user.id, now);
  setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    const errorMessage = {
      content: '❌ An error occurred while executing this command!',
      ephemeral: true
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);