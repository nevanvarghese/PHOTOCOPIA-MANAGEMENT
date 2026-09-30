const http = require('http');
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionsBitField 
} = require('discord.js');

// Keep Render web service active
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("PHOTOCOPIA MANAGEMENT BOT is running!");
    res.end();
}).listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Memory storage for user strikes: { [userId]: strikeCount }
const userStrikes = new Map();

// Put your Discord User ID here so the bot knows who to DM when a strike happens!
// (Right-click your profile in Discord -> Copy User ID)
const FOUNDER_USER_ID =1025757148543721474; 

// Bad word filter list (Add any variation of racist/hate speech terms you want to block)
const bannedWords = ['nigger', 'nigga', 'faggot', 'chink', 'retard']; // Expand safely as needed

client.once('ready', async () => {
    console.log(`Management Bot logged in as ${client.user.tag}!`);

    const commands = [
        new SlashCommandBuilder()
            .setName('purge')
            .setDescription('Delete a specific number of messages')
            .addIntegerOption(option =>
                option.setName('amount')
                    .setDescription('Number of messages to delete (1-100)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(100)
            ),
        new SlashCommandBuilder()
            .setName('strike')
            .setDescription('Issue a strike to a rule-breaking member')
            .addUserOption(option =>
                option.setName('target')
                    .setDescription('The user to strike')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for the strike')
                    .setRequired(true)
            )
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully registered management slash commands.');
    } catch (error) {
        console.error(error);
    }
});

// Auto-Mod: Check for banned words, delete message, DM user, and DM founder
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const contentLower = message.content.toLowerCase();
    const containsBadWord = bannedWords.some(word => contentLower.includes(word));

    if (containsBadWord) {
        try {
            // 1. Delete the offensive message
            await message.delete();

            const userId = message.author.id;
            const currentStrikes = (userStrikes.get(userId) || 0) + 1;
            userStrikes.set(userId, currentStrikes);

            let actionTaken = 'Warning & 1-Hour Timeout';
            if (currentStrikes === 1) {
                await message.member?.timeout(60 * 60 * 1000, 'Auto-Mod: Hate speech / Racism').catch(() => {});
            } else if (currentStrikes === 2) {
                actionTaken = 'Warning & 24-Hour Timeout';
                await message.member?.timeout(24 * 60 * 60 * 1000, 'Auto-Mod: Repeated hate speech').catch(() => {});
            } else if (currentStrikes >= 3) {
                actionTaken = 'Permanent Ban (3 Strikes Reached)';
                await message.member?.ban({ reason: 'Auto-Mod: Reached 3 strikes for hate speech/racism' }).catch(() => {});
            }

            // 2. DM the rule-breaker privately
            try {
                await message.author.send(`⚠️ **Notice from Inspiration Gallery Moderation:**\nYour recent message in **${message.guild.name}** was deleted because it violated our rules against spam, racism, or hate speech.\n\n*This is Strike **${currentStrikes}/3**. Action taken: **${actionTaken}**.* Please review our rules to avoid further action.`);
            } catch (err) {
                // Fails if user has DMs closed, which is fine
            }

            // 3. DM the Founder (You) with full details
            if (FOUNDER_USER_ID && FOUNDER_USER_ID !== 'YOUR_DISCORD_USER_ID_HERE') {
                try {
                    const founderUser = await client.users.fetch(FOUNDER_USER_ID);
                    await founderUser.send(`🚨 **Auto-Mod Alert in ${message.guild.name}**\n\n• **User:** ${message.author.tag} (${message.author.id})\n• **Channel:** #${message.channel.name}\n• **Offending Content:** "${message.content}"\n• **Current Strike Count:** ${currentStrikes}/3\n• **Action Applied:** ${actionTaken}`);
                } catch (err) {
                    console.error('Could not DM founder:', err);
                }
            }

        } catch (err) {
            console.error('Failed to process auto-mod violation:', err);
        }
    }
});

// Automatic Welcome Message using your Inspiration Gallery text layout
client.on('guildMemberAdd', async (member) => {
    const welcomeChannel = member.guild.channels.cache.find(c => c.name.includes('rules-and-welcome'));
    if (!welcomeChannel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setTitle('🌟 WELCOME TO INSPIRATION GALLERY')
        .setDescription(`Looking for a vibrant, aesthetically driven photography community where your shots actually get featured and noticed? Whether you shoot on a professional Mirrorless rig, a vintage film camera, or just your smartphone—Inspiration Gallery is built for creators like you, ${member}!\n\n` +
            `**📌 WHAT WE OFFER:**\n\n` +
            `**📸 Daily & Weekly Features:**\n` +
            `• **Photo of the Day (POTD)** – Daily showcases selected by our community team!\n` +
            `• **Photo of the Week (POTW)** – Weekly community voting for top spot!\n` +
            `• **Photo of the Year (POTY)** – Hall of Fame glory for ultimate winners!\n\n` +
            `**🔍 Dedicated Galleries & Practice:**\n` +
            `• Dedicated channels for DSLR/Mirrorless, Mobile Shots, and Film/Analog.\n` +
            `• **RAW Edits Lounge** – Download raw image files provided by members to practice color grading and editing!\n` +
            `• **Visual Inspiration** – Mood boards, lighting setups, color palettes, and famous photography references to spark your creative flow.\n\n` +
            `**🎉 Events & Community:**\n` +
            `• **Weekly Photo Challenges** – Fun themes with pings to push your creative boundaries.\n` +
            `• **Critique & Feedback** – Constructive technical feedback on lighting, composition, and post-processing.\n` +
            `• **Active Lounge** – Chill voice/text chats to discuss gear, Lightroom presets, Snapseed tricks, and shooting setups!\n\n` +
            `*All skill levels, gear types, and editing styles are welcome.*`)
        .setColor(0x3498db)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'Inspiration Gallery Moderation & Welcome System' })
        .setTimestamp();

    await welcomeChannel.send({ embeds: [welcomeEmbed] });
});

// Slash command interactions (Purge & Manual Strike System)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const modPermissions = interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
                           interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (!modPermissions) {
        return interaction.reply({ content: '❌ You do not have permission to use management commands!', ephemeral: true });
    }

    // Purge Command
    if (interaction.commandName === 'purge') {
        const amount = interaction.options.getInteger('amount');
        try {
            await interaction.channel.bulkDelete(amount, true);
            await interaction.reply({ content: `✅ Cleared **${amount}** messages.`, ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to delete messages (they might be older than 14 days).', ephemeral: true });
        }
    }

    // Manual Strike System Command
    else if (interaction.commandName === 'strike') {
        const target = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);

        if (!member) {
            return interaction.reply({ content: '❌ Could not find that user in the server.', ephemeral: true });
        }

        const userId = target.id;
        const currentStrikes = (userStrikes.get(userId) || 0) + 1;
        userStrikes.set(userId, currentStrikes);

        let actionText = '1-Hour Timeout';
        if (currentStrikes === 1) {
            await member.timeout(60 * 60 * 1000, `Strike 1: ${reason}`).catch(() => {});
        } else if (currentStrikes === 2) {
            actionText = '24-Hour Timeout';
            await member.timeout(24 * 60 * 60 * 1000, `Strike 2: ${reason}`).catch(() => {});
        } else if (currentStrikes >= 3) {
            actionText = 'Permanent Ban';
            await member.ban({ reason: `Reached 3 strikes. Last reason: ${reason}` }).catch(() => {});
        }

        // DM the user their strike notice
        await target.send(`⚠️ You have received a strike in **${interaction.guild.name}**.\n• **Reason:** ${reason}\n• **Total Strikes:** ${currentStrikes}/3\n• **Action:** ${actionText}`).catch(() => {});

        await interaction.reply({ 
            content: `✅ Successfully issued **Strike ${currentStrikes}** to ${target.tag}.\nReason: *${reason}*`, 
            ephemeral: true 
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
