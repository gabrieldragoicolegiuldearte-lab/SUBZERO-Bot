require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  Events,
  EmbedBuilder,
} = require('discord.js');

const DEFAULT_BASE_ROLE = 'Customer';

const RESELL_VARIANTS = {
  'sneakers-streetwear': {
    label: 'Sneakers & Streetwear',
    color: '#5865F2',
    roles: [
      { name: 'Owner / Admin', color: '#FF3B30', hoist: true },
      { name: 'Staff', color: '#F59E0B', hoist: true },
      { name: 'Reseller', color: '#5865F2', hoist: true },
      { name: 'Verified Buyer', color: '#10B981', hoist: false },
      { name: 'Customer', color: '#94A3B8', hoist: false },
    ],
    cats: [
      {
        name: '📦 SNEAKERS & STREETWEAR',
        channels: ['reguli', 'drop-uri', 'legit-check', 'wtb-wts', 'vc-resell'],
      },
      {
        name: '🔒 STAFF & COMENZI',
        private: true,
        allowRoles: ['Owner / Admin', 'Staff'],
        channels: ['comenzi-active', 'vouch-logs', 'staff-chat'],
      },
    ],
  },

  'electronics-tech': {
    label: 'Electronics & Tech',
    color: '#06B6D4',
    roles: [
      { name: 'Owner / Admin', color: '#FF3B30', hoist: true },
      { name: 'Staff', color: '#F59E0B', hoist: true },
      { name: 'Tech Reseller', color: '#06B6D4', hoist: true },
      { name: 'Verified Buyer', color: '#10B981', hoist: false },
      { name: 'Customer', color: '#94A3B8', hoist: false },
    ],
    cats: [
      {
        name: '💻 ELECTRONICS & TECH',
        channels: ['reguli', 'drop-tech', 'legit-check', 'preturi-stoc', 'support-comenzi'],
      },
      {
        name: '🔒 STAFF & WARRANTY',
        private: true,
        allowRoles: ['Owner / Admin', 'Staff'],
        channels: ['facturi-stoc', 'logs-tech', 'staff-chat'],
      },
    ],
  },

  'accounts-digital': {
    label: 'Accounts & Digital',
    color: '#A855F7',
    roles: [
      { name: 'Owner / Admin', color: '#FF3B30', hoist: true },
      { name: 'Staff', color: '#F59E0B', hoist: true },
      { name: 'Supplier', color: '#A855F7', hoist: true },
      { name: 'Verified Buyer', color: '#10B981', hoist: false },
      { name: 'Customer', color: '#94A3B8', hoist: false },
    ],
    cats: [
      {
        name: '🔑 ACCOUNTS & DIGITAL',
        channels: ['reguli', 'stoc-conturi', 'vouch-feedback', 'tickete-comenzi'],
      },
      {
        name: '🔒 STAFF & DELIVERY',
        private: true,
        allowRoles: ['Owner / Admin', 'Staff'],
        channels: ['livrari', 'logs-digital', 'staff-chat'],
      },
    ],
  },

  'full-resell': {
    label: 'Full Resell Hub',
    color: '#22C55E',
    roles: [
      { name: 'Owner / Admin', color: '#FF3B30', hoist: true },
      { name: 'Staff', color: '#F59E0B', hoist: true },
      { name: 'Reseller', color: '#5865F2', hoist: true },
      { name: 'Verified Buyer', color: '#22C55E', hoist: false },
      { name: 'Customer', color: '#94A3B8', hoist: false },
    ],
    cats: [
      {
        name: '📌 INFO & RESELL',
        channels: ['reguli', 'anunturi-drop', 'legit-check', 'wtb-wts', 'stoc-preturi', 'vc-resell'],
      },
      {
        name: '🔒 STAFF & COMENZI',
        private: true,
        allowRoles: ['Owner / Admin', 'Staff'],
        channels: ['comenzi', 'vouch-logs', 'staff-chat'],
      },
    ],
  },
};

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Creează serverul de resell pe o variantă aleasă, cu grade și permisiuni')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName('varianta')
        .setDescription('Alege varianta de resell')
        .setRequired(true)
        .addChoices(
          { name: 'Sneakers & Streetwear', value: 'sneakers-streetwear' },
          { name: 'Electronics & Tech', value: 'electronics-tech' },
          { name: 'Accounts & Digital', value: 'accounts-digital' },
          { name: 'Full Resell Hub', value: 'full-resell' }
        )
    )
    .addStringOption((o) =>
      o.setName('extra').setDescription('Canale în plus, separate prin virgulă')
    ),

  new SlashCommandBuilder()
    .setName('grad')
    .setDescription('Dă sau scoate un grad unui membru')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((o) =>
      o.setName('membru').setDescription('Membrul vizat').setRequired(true)
    )
    .addRoleOption((o) =>
      o.setName('rol').setDescription('Gradul / rolul').setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName('actiune')
        .setDescription('Adaugă sau scoate')
        .setRequired(true)
        .addChoices({ name: 'Adaugă', value: 'add' }, { name: 'Scoate', value: 'remove' })
    ),

  new SlashCommandBuilder()
    .setName('drop')
    .setDescription('Postează rapid un anunț de drop / stoc resell')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName('produs').setDescription('Numele produsului / drop-ului').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('pret').setDescription('Preț / detalii').setRequired(true)
    )
    .addChannelOption((o) =>
      o
        .setName('canal')
        .setDescription('Canalul unde se postează')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),
].map((c) => c.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

function sanitizeChannelName(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot online: ${readyClient.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('Comenzile Resell au fost înregistrate.');
});

// Dă automat gradul de bază la membrii noi
client.on(Events.GuildMemberAdd, async (member) => {
  const baseRole = member.guild.roles.cache.find((r) => r.name === DEFAULT_BASE_ROLE);
  if (baseRole) {
    await member.roles.add(baseRole).catch(() => null);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;
  const { commandName, guild } = interaction;

  try {
    if (commandName === 'setup') {
      await interaction.deferReply({ ephemeral: true });

      const variantKey = interaction.options.getString('varianta', true);
      const variant = RESELL_VARIANTS[variantKey];
      const extra = (interaction.options.getString('extra') || '')
        .split(',')
        .map(sanitizeChannelName)
        .filter(Boolean);

      const createdRoles = new Map();
      for (const r of variant.roles) {
        const existing = guild.roles.cache.find((role) => role.name === r.name);
        const roleObj =
          existing ||
          (await guild.roles.create({
            name: r.name,
            color: r.color,
            hoist: r.hoist,
          }));
        createdRoles.set(r.name, roleObj);
      }

      for (const cat of variant.cats) {
        const overwrites = [];

        if (cat.private) {
          overwrites.push({
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          });

          for (const roleName of cat.allowRoles || []) {
            const roleObj = createdRoles.get(roleName);
            if (roleObj) {
              overwrites.push({
                id: roleObj.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
              });
            }
          }
        }

        const category = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: overwrites,
        });

        for (const ch of cat.channels) {
          await guild.channels.create({
            name: ch,
            type: ch.startsWith('vc-') ? ChannelType.GuildVoice : ChannelType.GuildText,
            parent: category.id,
          });
        }
      }

      if (extra.length) {
        const extraCat = await guild.channels.create({
          name: '✨ EXTRA RESELL',
          type: ChannelType.GuildCategory,
        });
        for (const ch of extra) {
          await guild.channels.create({
            name: ch,
            type: ChannelType.GuildText,
            parent: extraCat.id,
          });
        }
      }

      return interaction.editReply(
        `Gata! Am configurat varianta **${variant.label}**, am creat gradele și permisiunile automate.`
      );
    }

    if (commandName === 'grad') {
      const member = interaction.options.getMember('membru');
      const role = interaction.options.getRole('rol', true);
      const actiune = interaction.options.getString('actiune', true);

      if (!member) {
        return interaction.reply({ content: 'Nu am găsit membrul pe server.', ephemeral: true });
      }

      if (actiune === 'add') {
        await member.roles.add(role);
        return interaction.reply({
          content: `Am acordat gradul **${role.name}** lui <@${member.id}>.`,
          ephemeral: true,
        });
      } else {
        await member.roles.remove(role);
        return interaction.reply({
          content: `Am scos gradul **${role.name}** de la <@${member.id}>.`,
          ephemeral: true,
        });
      }
    }

    if (commandName === 'drop') {
      const produs = interaction.options.getString('produs', true);
      const pret = interaction.options.getString('pret', true);
      const canal = interaction.options.getChannel('canal') || interaction.channel;

      const embed = new EmbedBuilder()
        .setTitle(`📦 DROP / STOC: ${produs}`)
        .setDescription(`**Detalii / Preț:** ${pret}`)
        .setColor('#5865F2')
        .setTimestamp();

      await canal.send({ embeds: [embed] });
      return interaction.reply({ content: `Drop postat în <#${canal.id}>.`, ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    const msg =
      'Eroare la rularea comenzii. Verifică dacă rolul botului este mai sus în listă și dacă are permisiunile necesare.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg }).catch(() => null);
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => null);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);