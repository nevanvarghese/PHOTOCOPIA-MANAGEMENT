const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  PermissionFlagsBits 
} = require('discord.js');
const http = require('http');

// ==========================================
// CONFIGURATION
// ==========================================
const FOUNDER_USER_ID = 1025757148543721474; // Replace with your actual user ID

// Banned words list for auto-moderation
const BANNED_WORDS = [
  'nigger', 'nigga', 'faggot', 'retard', 'kike', 'spic', 'chink', 'wetback'
];

// In-memory trackers
const strikeLog = new Map();       // { userId: strikeCount }
const userImageCounts = new Map(); // { userId: imageCount }
const postedImageHashes = new Set(); // Stores attachment URLs/proxies to prevent duplicates

// Gallery channels where the rules apply
const GALLERY_CHANNELS = [
  'camera-shots',
  'mobile-shots',
  'raw-edits-lounge',
  'visual-inspiration',
  'monthly-challenge-photos'
];

// 10-Image Milestone Ranks
function getRankTitle(count) {
  if (count >= 100) return 'Legendary Curator 🏆';
  if (count >= 90) return 'Visionary Shutterbug ✨';
  if (count >= 80) return 'Gallery Elite 🌟';
  if (count >= 70) return 'Studio Veteran 🎬';
  if (count >= 60) return 'Master of Light 💡';
  if (count >= 50) return 'Composition Specialist 📐';
  if (count >= 40) return 'Aesthetic Explorer 🧭';
  if (count >= 30) return 'Frame Apprentice 🎞️';
  if (count >= 20) return 'Dedicated Shooter 📸';
  if (count >= 10) return 'Aspiring Hobbyist 📷';
  return 'Smartphone Snapshotter / Novice Lens 📱';
}

// ==========================================
// HTTP SERVER (FOR RENDER 24/7 UPTIME)
// ==========================================
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Photocopia Management Bot is active and running!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Dummy HTTP server listening on port ${PORT}`);
});

// ==========================================
// DISCORD CLIENT SETUP
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Register Slash Commands
const commands = [
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a specified number of messages')
    .addIntegerOption(option => 
      option.setName('count')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('strike')
    .setDescription('Manually issue a strike to a member')
    .addUserOption(option => 
      option.setName('target')
        .setDescription('The user to strike')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the strike')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('removestrike')
    .setDescription('Remove a strike from a member and reduce their strike count')
    .addUserOption(option => 
      option.setName('target')
        .setDescription('The user to remove a strike from')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('level')
    .setDescription('Check a member photography level, image count, and rank')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user whose level you want to check')
        .setRequired(false))
].map(command => command.toJSON());

client.once('ready', async () => {
  console.log(`Management Bot logged in as ${client.user.tag}!`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Refreshing management slash commands...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    console.log('Successfully registered management slash commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

// ==========================================
// WELCOME MESSAGE HANDLER (#rules-and-welcome)
// ==========================================
client.on('guildMemberAdd', async (member) => {
  try {
    const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === 'rules-and-welcome');
    if (!welcomeChannel) return;

    const welcomeEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('✨ WELCOME TO INSPIRATION GALLERY ✨')
      .setDescription(
        `Looking for a vibrant, aesthetically driven photography community where your shots actually get featured and noticed? Whether you shoot on a professional Mirrorless rig, a vintage film camera, or just your smartphone—Inspiration Gallery is built for creators like you!\n\n` +
        `📦 **WHAT WE OFFER:**\n\n` +
        `📸 **Daily & Weekly Features:**\n` +
        `• **Photo of the Day (POTD)** – Daily showcases selected by our community team!\n` +
        `• **Photo of the Week (POTW)** – Weekly community voting for top spot!\n` +
        `• **Photo of the Year (POTY)** – Hall of Fame glory for ultimate winners!\n\n` +
        `📂 **Dedicated Galleries & Practice:**\n` +
        `• Dedicated channels for DSLR/Mirrorless, Mobile Shots, and Film/Analog.\n` +
        `• **RAW Edits Lounge** – Download raw image files provided by members to practice color grading and editing!\n` +
        `• **Visual Inspiration** – Mood boards, lighting setups, color palettes, and famous photography references to spark your creative flow.\n\n` +
        `🎯 **Events & Community:**\n` +
        `• **Weekly Photo Challenges** – Fun themes with pings to push your creative boundaries.\n` +
        `• **Critique & Feedback** – Constructive technical feedback on lighting, composition, and post-processing.\n` +
        `• **Active Lounge** – Chill voice/text chats to discuss gear, Lightroom presets, Snapseed tricks, and shooting setups!\n\n` +
        `───────────────────────────────\n` +
        `*All skill levels, gear types, and editing styles are welcome.*`
      )
      .setFooter({ text: `Glad to have you here, ${member.user.tag}!` })
      .setTimestamp();

    await welcomeChannel.send({ content: `Welcome ${member}!`, embeds: [welcomeEmbed] });
  } catch (err) {
    console.error('Error sending welcome message:', err);
  }
});

// ==========================================
// AUTO-MOD, GALLERY RULES & AI DETECTION
// ==========================================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const channelName = message.channel.name;
  const isGalleryChannel = GALLERY_CHANNELS.includes(channelName);

  // 1. GALLERY CHANNEL ENFORCEMENT (Image-Only, Duplication Check & AI Guard)
  if (isGalleryChannel) {
    const hasImage = message.attachments.size > 0 && message.attachments.some(att => att.contentType && att.contentType.startsWith('image'));

    // STRICT RULE: If it doesn't have an image file attached, delete it instantly!
    if (!hasImage) {
      try {
        await message.delete();
        const warning = await message.channel.send(`${message.author}, this is a strict photo gallery channel! Please post images only (no text or chat messages here).`);
        setTimeout(() => warning.delete().catch(() => {}), 5000);
      } catch (err) {
        console.error('Failed to clean text message in gallery (Check bot permissions/role hierarchy):', err);
      }
      return;
    }

    // Check for Duplication
    const attachment = message.attachments.first();
    const proxyUrl = attachment.proxyURL;

    if (postedImageHashes.has(proxyUrl)) {
      try {
        await message.delete();
        const warning = await message.channel.send(`${message.author}, that exact image has already been posted in the server galleries. Duplicate uploads are not allowed!`);
        setTimeout(() => warning.delete().catch(() => {}), 5000);
      } catch (err) {
        console.error('Failed to block duplicate image:', err);
      }
      return;
    }

    // Add to duplicate cache
    postedImageHashes.add(proxyUrl);

    // AI Image Detection Guard
    const contentCheck = (message.content || '').toLowerCase();
    const fileName = attachment.name ? attachment.name.toLowerCase() : '';
    const isAiGenerated = fileName.includes('midjourney') || 
                          fileName.includes('dalle') || 
                          fileName.includes('stable-diffusion') || 
                          contentCheck.includes('midjourney') || 
                          contentCheck.includes('ai generated');

    if (isAiGenerated) {
      try {
        await message.delete();
        
        const userId = message.author.id;
        let currentStrikes = (strikeLog.get(userId) || 0) + 1;
        strikeLog.set(userId, currentStrikes);

        let punishmentAction = '';
        if (currentStrikes === 1) {
          await message.member.timeout(60 * 60 * 1000, 'Auto-mod: AI-generated image posted in gallery');
          punishmentAction = 'Issued Strike 1: 1-hour timeout.';
        } else if (currentStrikes === 2) {
          await message.member.timeout(24 * 60 * 60 * 1000, 'Auto-mod: AI-generated image posted in gallery');
          punishmentAction = 'Issued Strike 2: 24-hour timeout.';
        } else {
          await message.guild.members.ban(userId, { reason: 'Auto-mod: Strike 3 reached (AI image policy violation)' });
          punishmentAction = 'Issued Strike 3: Member banned.';
        }

        await message.channel.send(`${message.author}, AI-generated images are not permitted in real photography channels. ${punishmentAction}`);

        if (FOUNDER_USER_ID && FOUNDER_USER_ID !== 'YOUR_DISCORD_USER_ID_HERE') {
          const founderUser = await client.users.fetch(FOUNDER_USER_ID).catch(() => null);
          if (founderUser) {
            await founderUser.send(`🤖 **AI Image Violation Alert** 🤖\nUser: \`${message.author.tag}\` (${userId})\nChannel: \`#${channelName}\`\nAction: ${punishmentAction}`);
          }
        }
      } catch (err) {
        console.error('Error handling AI image penalty:', err);
      }
      return;
    }

    // Award XP / Increment Photo Count for valid new images
    const userId = message.author.id;
    const currentImages = (userImageCounts.get(userId) || 0) + 1;
    userImageCounts.set(userId, currentImages);

    if (currentImages % 10 === 0) {
      const newRank = getRankTitle(currentImages);
      message.channel.send(`🎉 Congrats ${message.author}! You've reached **${currentImages} photos** posted and unlocked the rank: **${newRank}**!`).catch(() => {});
    }
  }

  // 2. BANNED WORDS AUTO-MOD SCANNER
  const contentLower = message.content.toLowerCase();
  const matchedWord = BANNED_WORDS.find(word => contentLower.includes(word));

  if (matchedWord) {
    try {
      await message.delete();

      const userId = message.author.id;
      let currentStrikes = (strikeLog.get(userId) || 0) + 1;
      strikeLog.set(userId, currentStrikes);

      let punishmentAction = '';
      if (currentStrikes === 1) {
        await message.member.timeout(60 * 60 * 1000, 'Auto-mod: Strike 1 (Hate Speech)');
        punishmentAction = 'Issued Strike 1: 1-hour timeout.';
      } else if (currentStrikes === 2) {
        await message.member.timeout(24 * 60 * 60 * 1000, 'Auto-mod: Strike 2 (Hate Speech)');
        punishmentAction = 'Issued Strike 2: 24-hour timeout.';
      } else {
        await message.guild.members.ban(userId, { reason: 'Auto-mod: Strike 3 reached (Hate Speech)' });
        punishmentAction = 'Issued Strike 3: Member banned.';
      }

      try {
        await message.author.send(`You received a strike in **${message.guild.name}** for using prohibited language. Action taken: ${punishmentAction}`);
      } catch (dmErr) {}

      if (FOUNDER_USER_ID && FOUNDER_USER_ID !== 'YOUR_DISCORD_USER_ID_HERE') {
        const founderUser = await client.users.fetch(FOUNDER_USER_ID).catch(() => null);
        if (founderUser) {
          await founderUser.send(`🚨 **Auto-Mod Alert** 🚨\nUser: \`${message.author.tag}\` (${userId})\nServer: \`${message.guild.name}\`\nContent: \`${message.content}\`\nAction: ${punishmentAction} (Total Strikes: ${currentStrikes})`);
        }
      }
    } catch (err) {
      console.error('Error handling auto-mod violation:', err);
    }
  }
});

// ==========================================
// SLASH COMMAND EXECUTIONS
// ==========================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // 1. Purge Command
  if (commandName === 'purge') {
    const count = interaction.options.getInteger('count');
    if (count < 1 || count > 100) {
      return interaction.reply({ content: 'Please provide a number between 1 and 100.', ephemeral: true });
    }

    try {
      await interaction.channel.bulkDelete(count, true);
      await interaction.reply({ content: `Successfully purged ${count} messages.`, ephemeral: true });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: 'Failed to delete messages. Ensure they are not older than 14 days.', ephemeral: true });
    }
  } 
  
  // 2. Manual Strike Command
  else if (commandName === 'strike') {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({ content: 'That user is not in the server.', ephemeral: true });
    }

    const userId = target.id;
    let currentStrikes = (strikeLog.get(userId) || 0) + 1;
    strikeLog.set(userId, currentStrikes);

    let actionTaken = '';
    if (currentStrikes === 1) {
      await member.timeout(60 * 60 * 1000, reason);
      actionTaken = '1-hour timeout (Strike 1)';
    } else if (currentStrikes === 2) {
      await member.timeout(24 * 60 * 60 * 1000, reason);
      actionTaken = '24-hour timeout (Strike 2)';
    } else {
      await member.ban({ reason });
      actionTaken = 'Banned (Strike 3)';
    }

    await interaction.reply({ content: `Successfully struck ${target.tag}. Total strikes: ${currentStrikes}. Action: ${actionTaken}.`, ephemeral: true });
  }

  // 3. Remove Strike Command
  else if (commandName === 'removestrike') {
    const target = interaction.options.getUser('target');
    const userId = target.id;
    let currentStrikes = strikeLog.get(userId) || 0;

    if (currentStrikes <= 0) {
      return interaction.reply({ content: `${target.tag} has no active strikes to remove.`, ephemeral: true });
    }

    currentStrikes -= 1;
    strikeLog.set(userId, currentStrikes);

    await interaction.reply({ content: `Successfully removed a strike from ${target.tag}. Their new strike total is: **${currentStrikes}**.`, ephemeral: true });
  }

  // 4. Level / Rank Command (/level)
  else if (commandName === 'level') {
    const target = interaction.options.getUser('target') || interaction.user;
    const userId = target.id;
    const imagesCount = userImageCounts.get(userId) || 0;
    const rankTitle = getRankTitle(imagesCount);
    const strikes = strikeLog.get(userId) || 0;

    const rankEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`📊 Photographer Stats: ${target.tag}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: '📷 Total Photos Posted', value: `${imagesCount} images`, inline: true },
        { name: '🎖️ Current Rank', value: rankTitle, inline: true },
        { name: '⚠️ Active Strikes', value: `${strikes}`, inline: true }
      )
      .setFooter({ text: 'Inspiration Gallery Management System' })
      .setTimestamp();

    await interaction.reply({ embeds: [rankEmbed] });
  }
});

client.login(process.env.DISCORD_TOKEN);
