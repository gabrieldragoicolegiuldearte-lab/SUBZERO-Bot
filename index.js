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
  MessageFlags,
} = require('discord.js');

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
];

function buildGeminiUrl(modelName, apiKey) {
  return (
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    modelName +
    ':generateContent?key=' +
    encodeURIComponent(apiKey)
  );
}

const RESELL_VARIANTS = {
  'sneakers-streetwear': {
    label: 'Sneakers & Streetwear',
    roles: [
      { name: 'Owner / Admin', color: '#FF3B30', hoist: true, staffOrMod: true },
      { name: 'Staff', color: '#F59E0B', hoist: true, staffOrMod: true },
      { name: 'Reseller', color: '#5865F2', hoist: true, staffOrMod: false },
      { name: 'Verified Buyer', color: '#10B981', hoist: false, staffOrMod: false },
      { name: 'Customer', color: '#94A3B8', hoist: false, staffOrMod: false },
    ],
    cats: [
      {
        name: '📦 SNEAKERS & STREETWEAR',
        private: false,
        allowRoles: [],
        channels: [
          { name: 'reguli', type: 'text', readOnlyForMembers: true, allowedWriters: ['Owner / Admin', 'Staff'] },
          { name: 'drop-uri', type: 'text', readOnlyForMembers: true, allowedWriters: ['Owner / Admin', 'Staff', 'Reseller'] },
          { name: 'legit-check', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'wtb-wts', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'vc-resell', type: 'voice', readOnlyForMembers: false, allowedWriters: [] },
        ],
      },
      {
        name: '🔒 STAFF & COMENZI',
        private: true,
        allowRoles: ['Owner / Admin', 'Staff'],
        channels: [
          { name: 'comenzi-active', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'vouch-logs', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'staff-chat', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
        ],
      },
    ],
  },

  'electronics-tech': {
    label: 'Electronics & Tech',
    roles: [
      { name: 'Owner / Admin', color: '#FF3B30', hoist: true, staffOrMod: true },
      { name: 'Staff', color: '#F59E0B', hoist: true, staffOrMod: true },
      { name: 'Tech Reseller', color: '#06B6D4', hoist: true, staffOrMod: false },
      { name: 'Verified Buyer', color: '#10B981', hoist: false, staffOrMod: false },
      { name: 'Customer', color: '#94A3B8', hoist: false, staffOrMod: false },
    ],
    cats: [
      {
        name: '💻 ELECTRONICS & TECH',
        private: false,
        allowRoles: [],
        channels: [
          { name: 'reguli', type: 'text', readOnlyForMembers: true, allowedWriters: ['Owner / Admin', 'Staff'] },
          { name: 'drop-tech', type: 'text', readOnlyForMembers: true, allowedWriters: ['Owner / Admin', 'Staff', 'Tech Reseller'] },
          { name: 'legit-check', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'preturi-stoc', type: 'text', readOnlyForMembers: true, allowedWriters: ['Owner / Admin', 'Staff', 'Tech Reseller'] },
          { name: 'support-comenzi', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
        ],
      },
      {
        name: '🔒 STAFF & WARRANTY',
        private: true,
        allowRoles: ['Owner / Admin', 'Staff'],
        channels: [
          { name: 'facturi-stoc', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'logs-tech', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'staff-chat', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
        ],
      },
    ],
  },

  'accounts-digital': {
    label: 'Accounts & Digital',
    roles: [
      { name: 'Owner / Admin', color: '#FF3B30', hoist: true, staffOrMod: true },
      { name: 'Staff', color: '#F59E0B', hoist: true, staffOrMod: true },
      { name: 'Supplier', color: '#A855F7', hoist: true, staffOrMod: false },
      { name: 'Verified Buyer', color: '#10B981', hoist: false, staffOrMod: false },
      { name: 'Customer', color: '#94A3B8', hoist: false, staffOrMod: false },
    ],
    cats: [
      {
        name: '🔑 ACCOUNTS & DIGITAL',
        private: false,
        allowRoles: [],
        channels: [
          { name: 'reguli', type: 'text', readOnlyForMembers: true, allowedWriters: ['Owner / Admin', 'Staff'] },
          { name: 'stoc-conturi', type: 'text', readOnlyForMembers: true, allowedWriters: ['Owner / Admin', 'Staff', 'Supplier'] },
          { name: 'vouch-feedback', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'tickete-comenzi', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
        ],
      },
      {
        name: '🔒 STAFF & DELIVERY',
        private: true,
        allowRoles: ['Owner / Admin', 'Staff'],
        channels: [
          { name: 'livrari', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'logs-digital', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'staff-chat', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
        ],
      },
    ],
  },

  'full-resell': {
    label: 'Full Resell Hub',
    roles: [
      { name: 'Owner / Admin', color: '#FF3B30', hoist: true, staffOrMod: true },
      { name: 'Staff', color: '#F59E0B', hoist: true, staffOrMod: true },
      { name: 'Reseller', color: '#5865F2', hoist: true, staffOrMod: false },
      { name: 'Verified Buyer', color: '#22C55E', hoist: false, staffOrMod: false },
      { name: 'Customer', color: '#94A3B8', hoist: false, staffOrMod: false },
    ],
    cats: [
      {
        name: '📌 INFO & RESELL',
        private: false,
        allowRoles: [],
        channels: [
          { name: 'reguli', type: 'text', readOnlyForMembers: true, allowedWriters: ['Owner / Admin', 'Staff'] },
          { name: 'anunturi-drop', type: 'text', readOnlyForMembers: true, allowedWriters: ['Owner / Admin', 'Staff', 'Reseller'] },
          { name: 'legit-check', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'wtb-wts', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'stoc-preturi', type: 'text', readOnlyForMembers: true, allowedWriters: ['Owner / Admin', 'Staff', 'Reseller'] },
          { name: 'vc-resell', type: 'voice', readOnlyForMembers: false, allowedWriters: [] },
        ],
      },
      {
        name: '🔒 STAFF & COMENZI',
        private: true,
        allowRoles: ['Owner / Admin', 'Staff'],
        channels: [
          { name: 'comenzi', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'vouch-logs', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
          { name: 'staff-chat', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
        ],
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
    .setName('custom')
    .setDescription('Generează 100% custom cu AI roluri, categorii, canale și permisiuni')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName('descriere')
        .setDescription('Descrie detaliat ce server vrei (ex: trotinete electrice și meet & greet)')
        .setRequired(true)
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

  new SlashCommandBuilder()
    .setName('wipe')
    .setDescription('Șterge canalele/categoriile și opțional rolurile de pe server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName('confirmare')
        .setDescription('Scrie exact: STERGE TOT')
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName('sterge_roluri')
        .setDescription('Vrei să șteargă și gradele/rolurile?')
        .setRequired(true)
        .addChoices({ name: 'Da', value: 'yes' }, { name: 'Nu', value: 'no' })
    ),
].map((c) => c.toJSON());

function sanitizeChannelName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 95);
}

function sanitizeHexColor(raw, fallback = '#5865F2') {
  if (typeof raw === 'string' && /^#[0-9A-Fa-f]{6}$/.test(raw.trim())) {
    return raw.trim();
  }
  return fallback;
}

function buildChannelOverwrites(guild, ch, createdRoles, isPrivateCat) {
  if (isPrivateCat || ch.type === 'voice' || !ch.readOnlyForMembers) {
    return [];
  }

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.SendMessages],
    },
  ];

  for (const roleName of ch.allowedWriters || []) {
    const roleObj = createdRoles.get(roleName);
    if (roleObj) {
      overwrites.push({
        id: roleObj.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      });
    }
  }

  return overwrites;
}

async function fetchWithTimeout(url, options, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiWithRetry(payload, maxRetries = 4) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Lipsește variabila GEMINI_API_KEY.');
  }

  let lastErrorText = '';
  let lastStatus = 0;

  for (const modelName of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let response;
      try {
        response = await fetchWithTimeout(
          buildGeminiUrl(modelName, apiKey),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          30000
        );
      } catch (fetchErr) {
        lastStatus = 0;
        lastErrorText =
          fetchErr?.name === 'AbortError'
            ? 'Timeout 30s la răspunsul Gemini'
            : fetchErr?.message || String(fetchErr);
        if (attempt < maxRetries) {
          const waitMs = attempt * 2000;
          console.warn(
            `Gemini (${modelName}) eroare rețea/timeout (încercarea ${attempt}/${maxRetries}). Reîncerc în ${waitMs / 1000}s...`
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        break;
      }

      if (response.ok) {
        return response.json();
      }

      lastStatus = response.status;
      lastErrorText = await response.text().catch(() => '');

      if (response.status === 503 && attempt < maxRetries) {
        const waitMs = attempt * 2000;
        console.warn(
          `Gemini (${modelName}) 503 (încercarea ${attempt}/${maxRetries}). Reîncerc în ${waitMs / 1000}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      break;
    }

    if (lastStatus !== 503 && lastStatus !== 404) {
      break;
    }
  }

  throw new Error(`Eroare Gemini API (${lastStatus}): ${lastErrorText.slice(0, 180)}`);
}

async function generateFullCustomPlanWithAI(promptText) {
  const systemInstruction = `Ești un designer profesionist de servere Discord. Primești o cerere în limba română și creezi o structură COMPLET personalizată, adaptată exact tematicii cerute (fără șabloane fixe de resell dacă tema este alta, ex: trotinete electrice și meet & greet).
Întoarce DOAR JSON valid (fără markdown, fără text suplimentar).

Format exact:
{
  "title": "Titlu scurt și clar",
  "baseRoleName": "Numele rolului de bază pentru membri noi (ex: Rider / Membru)",
  "roles": [
    { "name": "Fondator / Admin", "color": "#FF3B30", "hoist": true, "staffOrMod": true },
    { "name": "Organizator Meet", "color": "#F59E0B", "hoist": true, "staffOrMod": true },
    { "name": "Pro Rider", "color": "#3B82F6", "hoist": true, "staffOrMod": false },
    { "name": "Rider / Membru", "color": "#94A3B8", "hoist": false, "staffOrMod": false }
  ],
  "cats": [
    {
      "name": "🛴 INFO & MEET & GREET",
      "private": false,
      "allowRoles": [],
      "channels": [
        {
          "name": "reguli",
          "type": "text",
          "readOnlyForMembers": true,
          "allowedWriters": ["Fondator / Admin", "Organizator Meet"]
        },
        {
          "name": "anunturi-meetgreet",
          "type": "text",
          "readOnlyForMembers": true,
          "allowedWriters": ["Fondator / Admin", "Organizator Meet"]
        },
        {
          "name": "discutii-trotinete",
          "type": "text",
          "readOnlyForMembers": false,
          "allowedWriters": []
        },
        {
          "name": "vc-meetgreet",
          "type": "voice",
          "readOnlyForMembers": false,
          "allowedWriters": []
        }
      ]
    }
  ]
}

Reguli:
- Creează 3 până la 6 categorii bogate și bine organizate, relevante exact pentru cerere.
- Fiecare categorie să aibă între 2 și 7 canale relevante.
- Numele canalelor: litere mici, cifre, cratimă (fără spații/diacritice). Pentru canalele vocale folosește "type": "voice".
- Setează "readOnlyForMembers": true pe canalele unde scriu doar gradele superioare / organizatorii / rolurile speciale ("allowedWriters"), iar restul pot doar citi.
- Marchează cu "private": true doar categoriile interne de staff / organizare, cu "allowRoles" setat.`;

  const data = await callGeminiWithRetry({
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: `Cerere server: ${promptText}` }],
      },
    ],
    generationConfig: {
      temperature: 0.75,
      responseMimeType: 'application/json',
    },
  });

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Răspuns gol de la Gemini.');
  }

  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  const parsed = JSON.parse(cleaned);

  const roles =
    Array.isArray(parsed.roles) && parsed.roles.length
      ? parsed.roles.slice(0, 10).map((r, idx) => ({
          name: String(r.name || `Grad ${idx + 1}`).slice(0, 60),
          color: sanitizeHexColor(r.color),
          hoist: Boolean(r.hoist),
          staffOrMod: Boolean(r.staffOrMod),
        }))
      : RESELL_VARIANTS['full-resell'].roles;

  const cats =
    Array.isArray(parsed.cats) && parsed.cats.length
      ? parsed.cats.slice(0, 7).map((c, idx) => ({
          name: String(c.name || `📁 CATEGORIE ${idx + 1}`).slice(0, 80),
          private: Boolean(c.private),
          allowRoles: Array.isArray(c.allowRoles) ? c.allowRoles.map(String) : [],
          channels: Array.isArray(c.channels)
            ? c.channels
                .map((ch) => ({
                  name: sanitizeChannelName(typeof ch === 'string' ? ch : ch?.name),
                  type: ch?.type === 'voice' || String(ch?.name || '').startsWith('vc-') ? 'voice' : 'text',
                  readOnlyForMembers: Boolean(ch?.readOnlyForMembers),
                  allowedWriters: Array.isArray(ch?.allowedWriters) ? ch.allowedWriters.map(String) : [],
                }))
                .filter((ch) => Boolean(ch.name))
                .slice(0, 12)
            : [],
        }))
      : RESELL_VARIANTS['full-resell'].cats;

  return {
    title: String(parsed.title || 'Server Personalizat AI').slice(0, 80),
    baseRoleName: typeof parsed.baseRoleName === 'string' ? parsed.baseRoleName.slice(0, 60) : null,
    roles,
    cats,
  };
}

async function applyServerStructure(guild, structure) {
  const createdRoles = new Map();

  for (const r of structure.roles) {
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

  for (const cat of structure.cats) {
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
      const isVoice = ch.type === 'voice';
      const chOverwrites = buildChannelOverwrites(guild, ch, createdRoles, Boolean(cat.private));

      await guild.channels.create({
        name: ch.name,
        type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: chOverwrites,
      });
    }
  }

  return createdRoles;
}

async function checkGeminiConnection() {
  try {
    const data = await callGeminiWithRetry({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Răspunde cu un singur cuvânt: OK' }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 10,
      },
    });

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (reply) {
      console.log('Gemini conectat!');
    } else {
      console.warn('Gemini NECONECTAT: răspuns gol de la API.');
    }
  } catch (err) {
    console.error('Gemini NECONECTAT:', err?.message || err);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot online: ${readyClient.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('Comenzile au fost încărcate.');

  await checkGeminiConnection();
});

client.on(Events.GuildMemberAdd, async (member) => {
  const candidateRole =
    member.guild.roles.cache.find((r) => r.name === 'Customer') ||
    member.guild.roles.cache.find((r) => /membru|member|rider/i.test(r.name));
  if (candidateRole) {
    await member.roles.add(candidateRole).catch(() => null);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;
  const { commandName, guild } = interaction;
  const ephemeralOpts = { flags: MessageFlags.Ephemeral };

  try {
    if (commandName === 'setup') {
      await interaction.deferReply(ephemeralOpts);

      const variantKey = interaction.options.getString('varianta', true);
      const variant = RESELL_VARIANTS[variantKey];
      const extra = (interaction.options.getString('extra') || '')
        .split(',')
        .map(sanitizeChannelName)
        .filter(Boolean);

      await applyServerStructure(guild, {
        title: variant.label,
        roles: variant.roles,
        cats: variant.cats,
      });

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
        `Gata! Am configurat varianta **${variant.label}**, gradele și permisiunile de scriere pe canale.`
      );
    }

    if (commandName === 'custom') {
      await interaction.deferReply(ephemeralOpts);

      const descriere = interaction.options.getString('descriere', true);
      const plan = await generateFullCustomPlanWithAI(descriere);
      await applyServerStructure(guild, plan);

      const rolesList = plan.roles.map((r) => `\`${r.name}\``).join(', ');
      const catsList = plan.cats
        .map((c) => `• **${c.name}** (${c.channels.length} canale${c.private ? ', privat' : ''})`)
        .join('\n');

      return interaction.editReply(
        `Gata! Am generat cu AI **${plan.title}**.\n**Roluri create:** ${rolesList}\n${catsList}`
      );
    }

    if (commandName === 'grad') {
      const member = interaction.options.getMember('membru');
      const role = interaction.options.getRole('rol', true);
      const actiune = interaction.options.getString('actiune', true);

      if (!member) {
        return interaction.reply({ content: 'Nu am găsit membrul pe server.', ...ephemeralOpts });
      }

      if (actiune === 'add') {
        await member.roles.add(role);
        return interaction.reply({
          content: `Am acordat gradul **${role.name}** lui <@${member.id}>.`,
          ...ephemeralOpts,
        });
      } else {
        await member.roles.remove(role);
        return interaction.reply({
          content: `Am scos gradul **${role.name}** de la <@${member.id}>.`,
          ...ephemeralOpts,
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
      return interaction.reply({ content: `Drop postat în <#${canal.id}>.`, ...ephemeralOpts });
    }

    if (commandName === 'wipe') {
      const confirmare = interaction.options.getString('confirmare', true);
      const deleteRoles = interaction.options.getString('sterge_roluri', true) === 'yes';

      if (confirmare !== 'STERGE TOT') {
        return interaction.reply({
          content: 'Anulat. Ca să confirmi ștergerea, scrie exact `STERGE TOT` la opțiunea `confirmare`.',
          ...ephemeralOpts,
        });
      }

      await interaction.deferReply(ephemeralOpts);

      const channels = await guild.channels.fetch();
      let deletedChannels = 0;
      for (const [, ch] of channels) {
        if (!ch) continue;
        const ok = await ch
          .delete('Wipe comandat de administrator')
          .then(() => true)
          .catch(() => false);
        if (ok) deletedChannels++;
      }

      let deletedRoles = 0;
      if (deleteRoles) {
        const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
        const roles = await guild.roles.fetch();
        for (const [, role] of roles) {
          if (!role) continue;
          if (role.id === guild.roles.everyone.id) continue;
          if (role.managed) continue;
          if (me && role.position >= me.roles.highest.position) continue;

          const ok = await role
            .delete('Wipe roluri comandat de administrator')
            .then(() => true)
            .catch(() => false);
          if (ok) deletedRoles++;
        }
      }

      await guild.channels
        .create({
          name: 'general',
          type: ChannelType.GuildText,
        })
        .catch(() => null);

      return interaction.editReply(
        `Curățenie făcută: **${deletedChannels}** canale/categorii șterse` +
          (deleteRoles ? ` și **${deletedRoles}** roluri șterse.` : `.`) +
          ` Am creat un canal \`#general\` nou.`
      );
    }
  } catch (err) {
    console.error(err);
    const shortErr = String(err?.message || err).slice(0, 220);
    const msg = `Eroare la rularea comenzii: \`${shortErr}\``;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg }).catch(() => null);
    } else {
      await interaction.reply({ content: msg, ...ephemeralOpts }).catch(() => null);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
