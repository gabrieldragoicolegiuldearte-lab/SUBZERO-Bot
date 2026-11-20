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
  'gemma-4-26b-a4b-it',
];

let cachedGroqModels = null;

function buildGeminiUrl(modelName, apiKey) {
  return (
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    modelName +
    ':generateContent?key=' +
    encodeURIComponent(apiKey)
  );
}

const DEFAULT_FALLBACK_STRUCTURE = {
  title: 'Server Structurat AI',
  roles: [
    { name: 'Owner / Admin', color: '#FF3B30', hoist: true, staffOrMod: true },
    { name: 'Staff', color: '#F59E0B', hoist: true, staffOrMod: true },
    { name: 'VIP / Membru', color: '#5865F2', hoist: true, staffOrMod: false },
  ],
  cats: [
    {
      name: '📌 INFORMAȚII',
      private: false,
      allowRoles: [],
      channels: [
        { name: 'reguli', type: 'text', readOnlyForMembers: true, allowedWriters: ['Owner / Admin', 'Staff'] },
        { name: 'anunturi', type: 'text', readOnlyForMembers: true, allowedWriters: ['Owner / Admin', 'Staff'] },
        { name: 'general', type: 'text', readOnlyForMembers: false, allowedWriters: [] },
      ],
    },
  ],
};

const commands = [
  new SlashCommandBuilder()
    .setName('custom')
    .setDescription('Generează complet cu AI roluri, categorii, canale și permisiuni după orice cerere')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName('descriere')
        .setDescription('Scrie-i botului exact ce să facă (orice tematică, roluri, canale, permisiuni, resell etc.)')
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
    .setDescription('Șterge absolut tot: toate canalele, categoriile și rolurile posibile (fără a crea nimic nou)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName('confirmare')
        .setDescription('Scrie exact: STERGE TOT')
        .setRequired(true)
    ),
].map((c) => c.toJSON());

function sanitizeChannelName(raw) {
  return String(raw ?? '')
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

  const writers = ch.allowedWriters ?? [];
  for (const roleName of writers) {
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

async function fetchWithTimeout(url, options, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function resolveGroqModels(groqKey) {
  if (Array.isArray(cachedGroqModels) && cachedGroqModels.length > 0) {
    return cachedGroqModels;
  }

  const res = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/models',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
    },
    15000
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq /models ${res.status}:${errText.slice(0, 140)}`);
  }

  const json = await res.json();
  const rawList = json?.data ?? [];
  const ids = Array.isArray(rawList) ? rawList.map((m) => String(m?.id ?? '')).filter(Boolean) : [];

  const preferred = ids.filter(
    (id) =>
      !/whisper|guard|prompt-guard|tts|audio|vision|embedding|safeguard/i.test(id) &&
      (id.includes('llama') || id.includes('qwen') || id.includes('gemma') || id.includes('deepseek') || id.includes('mixtral'))
  );

  const candidates = preferred.length > 0 ? preferred.slice(0, 4) : ids.slice(0, 3);
  if (candidates.length === 0) {
    throw new Error('Nu s-a găsit niciun model Groq activ pe cheie.');
  }

  cachedGroqModels = candidates;
  console.log('Modele Groq detectate automat:', candidates.join(', '));
  return candidates;
}

async function callGroq(fullPrompt) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;

  const modelsToTry = await resolveGroqModels(groqKey);
  let lastError = '';

  for (const modelName of modelsToTry) {
    try {
      const response = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`, }, body: JSON.stringify({ model: modelName, messages: [{ role: 'user', content: fullPrompt }], temperature: 0.75, response_format: { type: 'json_object' }, }), }, 20000 );  if (response.ok) { const data = await response.json(); const text = data?.choices?.[0]?.message?.content; if (text) { console.log(`Groq (${modelName}) a răspuns cu succes!`);
          return text;
        }
      } else {
        const errText = await response.text().catch(() => '');
        lastError = `Groq (${modelName})${response.status}: ${errText.slice(0, 140)}`; console.warn(lastError); } } catch (err) { const detail = err?.message ?? err; lastError = `Groq (${modelName}) eroare: ${detail}`; console.warn(lastError); } }  throw new Error(lastError ? lastError : 'Groq nu a răspuns.'); }  async function callGeminiFallback(fullPrompt) { const apiKey = process.env.GEMINI_API_KEY; if (!apiKey) { throw new Error('Nu este setată nicio cheie validă (GROQ_API_KEY sau GEMINI_API_KEY).'); }  let lastStatus = 0; let lastErrorText = '';  for (const modelName of GEMINI_MODELS) { for (let attempt = 1; attempt <= 2; attempt++) { let response; try { response = await fetchWithTimeout( buildGeminiUrl(modelName, apiKey), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: fullPrompt }] }], generationConfig: { temperature: 0.75 }, }), }, 25000 ); } catch (fetchErr) { lastStatus = 0; lastErrorText = fetchErr?.message ?? String(fetchErr); if (attempt < 2) { await new Promise((r) => setTimeout(r, 2000)); continue; } break; }  if (response.ok) { const data = await response.json(); const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text; if (rawText) { console.log(`Gemini (${modelName}) a răspuns cu succes!`);
          return rawText;
        }
      }

      lastStatus = response.status;
      lastErrorText = await response.text().catch(() => '');
      if (response.status === 503 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      break;
    }
  }

  throw new Error(`Eroare AI API (${lastStatus}): ${lastErrorText.slice(0, 160)}`);
}

async function generateFullCustomPlanWithAI(promptText) {
  const fullPrompt = `Ești un designer profesionist de servere Discord. Primești orice instrucțiune / cerere de la utilizator în limba română (poate fi orice tematică: trotinete electrice, meet & greet, resell sneakers/tech/conturi, gaming, muzică, comunitate, etc., sau instrucțiuni exacte despre roluri, categorii, canale și permisiuni) și construiești exact structura cerută.
Întoarce DOAR JSON valid (fără markdown, fără \`\`\`json, fără text suplimentar).

Format exact:
{
  "title": "Titlu scurt și clar",
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
- Respectă întocmai tot ce cere utilizatorul în instrucțiune (nume de categorii, canale, roluri, permisiuni, tematică).
- Creează până la 8 categorii și până la 12 canale per categorie, relevante exact pentru cerere.
- Numele canalelor: litere mici, cifre, cratimă (fără spații/diacritice). Pentru canalele vocale folosește "type": "voice".
- Setează "readOnlyForMembers": true pe canalele unde scriu doar anumite roluri ("allowedWriters"), iar restul pot doar citi.
- Marchează cu "private": true doar categoriile private / interne, cu "allowRoles" setat.

Instrucțiune utilizator: ${promptText}`;

  let rawText = null;
  let groqErrMsg = '';

  if (process.env.GROQ_API_KEY) {
    try {
      rawText = await callGroq(fullPrompt);
    } catch (groqErr) {
      groqErrMsg = groqErr?.message ?? String(groqErr);
      console.warn('Groq a eșuat, trec pe rezerva Gemini:', groqErrMsg);
    }
  }

  if (!rawText) {
    try {
      rawText = await callGeminiFallback(fullPrompt);
    } catch (gemErr) {
      const gemDetail = gemErr?.message ?? gemErr;
      if (groqErrMsg) {
        throw new Error(`Groq: ${groqErrMsg} | Gemini: ${gemDetail}`);
      }
      throw new Error(String(gemDetail));
    }
  }

  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}');
  const cleaned =
    jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart
      ? rawText.slice(jsonStart, jsonEnd + 1)
      : rawText
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '');

  const parsed = JSON.parse(cleaned);

  const roles =
    Array.isArray(parsed.roles) && parsed.roles.length
      ? parsed.roles.slice(0, 15).map((r, idx) => ({
          name: String(r.name ?? `Grad ${idx + 1}`).slice(0, 60),
          color: sanitizeHexColor(r.color),
          hoist: Boolean(r.hoist),
          staffOrMod: Boolean(r.staffOrMod),
        }))
      : DEFAULT_FALLBACK_STRUCTURE.roles;

  const cats =
    Array.isArray(parsed.cats) && parsed.cats.length
      ? parsed.cats.slice(0, 8).map((c, idx) => ({
          name: String(c.name ?? `📁 CATEGORIE ${idx + 1}`).slice(0, 80),
          private: Boolean(c.private),
          allowRoles: Array.isArray(c.allowRoles) ? c.allowRoles.map(String) : [],
          channels: Array.isArray(c.channels)
            ? c.channels
                .map((ch) => ({
                  name: sanitizeChannelName(typeof ch === 'string' ? ch : ch?.name),
                  type: ch?.type === 'voice' || String(ch?.name ?? '').startsWith('vc-') ? 'voice' : 'text',
                  readOnlyForMembers: Boolean(ch?.readOnlyForMembers),
                  allowedWriters: Array.isArray(ch?.allowedWriters) ? ch.allowedWriters.map(String) : [],
                }))
                .filter((ch) => Boolean(ch.name))
                .slice(0, 12)
            : [],
        }))
      : DEFAULT_FALLBACK_STRUCTURE.cats;

  return {
    title: String(parsed.title ?? 'Server Personalizat AI').slice(0, 80),
    roles,
    cats,
  };
}

async function applyServerStructure(guild, structure) {
  const createdRoles = new Map();

  for (const r of structure.roles) {
    const existing = guild.roles.cache.find((role) => role.name === r.name);
    const roleObj =
      existing ??
      (await guild.roles.create({
        name: r.name,
        colors: [r.color],
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

      const allowed = cat.allowRoles ?? [];
      for (const roleName of allowed) {
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

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot online: ${readyClient.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('Comenzile au fost încărcate.');
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;
  const { commandName, guild } = interaction;
  const ephemeralOpts = { flags: MessageFlags.Ephemeral };

  try {
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
      const canal = interaction.options.getChannel('canal') ?? interaction.channel;

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

      if (confirmare !== 'STERGE TOT') {
        return interaction.reply({
          content: 'Anulat. Ca să confirmi ștergerea totală, scrie exact `STERGE TOT` la opțiunea `confirmare`.',
          ...ephemeralOpts,
        });
      }

      await interaction.deferReply(ephemeralOpts);

      // Șterge toate canalele și categoriile (copiile de canale mai întâi, apoi categoriile)
      const channels = await guild.channels.fetch();
      let deletedChannels = 0;

      for (const [, ch] of channels) {
        if (!ch || ch.type === ChannelType.GuildCategory) continue;
        const ok = await ch
          .delete('Wipe total comandat de administrator')
          .then(() => true)
          .catch(() => false);
        if (ok) deletedChannels++;
      }

      for (const [, ch] of channels) {
        if (!ch || ch.type !== ChannelType.GuildCategory) continue;
        const ok = await ch
          .delete('Wipe total categorii comandat de administrator')
          .then(() => true)
          .catch(() => false);
        if (ok) deletedChannels++;
      }

      // Șterge toate rolurile posibile de sub rolul botului (fără @everyone, roluri managed sau roluri peste bot)
      const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
      const roles = await guild.roles.fetch();
      let deletedRoles = 0;

      for (const [, role] of roles) {
        if (!role) continue;
        if (role.id === guild.roles.everyone.id) continue;
        if (role.managed) continue;
        if (me && role.position >= me.roles.highest.position) continue;

        const ok = await role
          .delete('Wipe total roluri comandat de administrator')
          .then(() => true)
          .catch(() => false);
        if (ok) deletedRoles++;
      }

      return interaction.editReply(
        `Wipe complet: **${deletedChannels}** canale/categorii șterse și **${deletedRoles}** roluri șterse. Nu am creat nimic nou.`
      );
    }
  } catch (err) {
    console.error(err);
    const errRaw = err?.message ?? err;
    const shortErr = String(errRaw).slice(0, 220);
    const msg = `Eroare la rularea comenzii: \`${shortErr}\``;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg }).catch(() => null);
    } else {
      await interaction.reply({ content: msg, ...ephemeralOpts }).catch(() => null);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
