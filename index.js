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
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemma-4-26b-a4b-it',
];

const TIMEOUT_DURATIONS = {
  '60s': { label: '60 secunde', ms: 60 * 1000 },
  '5m': { label: '5 minute', ms: 5 * 60 * 1000 },
  '10m': { label: '10 minute', ms: 10 * 60 * 1000 },
  '1h': { label: '1 oră', ms: 60 * 60 * 1000 },
  '1d': { label: '1 zi', ms: 24 * 60 * 60 * 1000 },
  '7d': { label: '7 zile', ms: 7 * 24 * 60 * 60 * 1000 },
  '28d': { label: '28 zile', ms: 28 * 24 * 60 * 60 * 1000 },
};

const BAN_DELETE_SECONDS = {
  none: { label: 'Fără ștergere mesaje', seconds: 0 },
  '1h': { label: 'Ultimele 1h', seconds: 3600 },
  '6h': { label: 'Ultimele 6h', seconds: 21600 },
  '24h': { label: 'Ultimele 24h', seconds: 86400 },
  '7d': { label: 'Ultimele 7 zile', seconds: 604800 },
};

const TICKET_OPEN_BTN_ID = 'subzero_ticket_open_buy';
const TICKET_CLOSE_BTN_ID = 'subzero_ticket_close';

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
        .setDescription('Scrie-i botului exact ce să facă (roluri, categorii, canale, permisiuni de scriere/vizualizare etc.)')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Postează panoul cu butonul de cumpărare / deschidere ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((o) =>
      o
        .setName('canal')
        .setDescription('Canalul unde se postează panoul de tickete')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),

  new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderare completă: timeout, scoatere timeout, ban, unban și kick')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption((o) =>
      o
        .setName('actiune')
        .setDescription('Alege acțiunea de moderare')
        .setRequired(true)
        .addChoices(
          { name: 'Timeout', value: 'timeout' },
          { name: 'Scoate Timeout', value: 'untimeout' },
          { name: 'Ban', value: 'ban' },
          { name: 'Unban (după ID)', value: 'unban' },
          { name: 'Kick', value: 'kick' }
        )
    )
    .addUserOption((o) =>
      o.setName('membru').setDescription('Membrul vizat (pentru timeout / ban / kick)')
    )
    .addStringOption((o) =>
      o.setName('user_id').setDescription('ID-ul utilizatorului (obligatoriu la unban, opțional la ban)')
    )
    .addStringOption((o) =>
      o
        .setName('durata')
        .setDescription('Durata pentru timeout')
        .addChoices(
          { name: '60 secunde', value: '60s' },
          { name: '5 minute', value: '5m' },
          { name: '10 minute', value: '10m' },
          { name: '1 oră', value: '1h' },
          { name: '1 zi', value: '1d' },
          { name: '7 zile', value: '7d' },
          { name: '28 zile', value: '28d' }
        )
    )
    .addStringOption((o) =>
      o
        .setName('sterge_mesaje')
        .setDescription('Cât istoric de mesaje să șteargă la ban')
        .addChoices(
          { name: 'Fără ștergere mesaje', value: 'none' },
          { name: 'Ultimele 1h', value: '1h' },
          { name: 'Ultimele 6h', value: '6h' },
          { name: 'Ultimele 24h', value: '24h' },
          { name: 'Ultimele 7 zile', value: '7d' }
        )
    )
    .addStringOption((o) =>
      o.setName('motiv').setDescription('Motivul acțiunii (opțional)')
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

function normalizeLookupName(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findTicketLogChannel(guild) {
  const candidates = guild.channels.cache.filter(
    (ch) => ch && (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement)
  );

  for (const [, ch] of candidates) {
    const norm = normalizeLookupName(ch.name);
    if (
      norm === 'log tickete' ||
      norm === 'logs tickete' ||
      norm === 'ticket logs' ||
      norm === 'ticket log' ||
      (norm.includes('log') && norm.includes('ticket'))
    ) {
      return ch;
    }
  }

  return null;
}

function resolveRoleByName(createdRoles, guild, roleName) {
  if (!roleName) return null;
  if (createdRoles.has(roleName)) {
    return createdRoles.get(roleName);
  }

  const targetNorm = normalizeLookupName(roleName);
  if (!targetNorm) return null;

  for (const [k, roleObj] of createdRoles.entries()) {
    const kNorm = normalizeLookupName(k);
    if (kNorm === targetNorm || kNorm.includes(targetNorm) || targetNorm.includes(kNorm)) {
      return roleObj;
    }
  }

  const guildRole = guild.roles.cache.find((r) => {
    if (r.id === guild.roles.everyone.id) return false;
    const rNorm = normalizeLookupName(r.name);
    return rNorm === targetNorm || rNorm.includes(targetNorm) || targetNorm.includes(rNorm);
  });

  return guildRole ?? null;
}

function sanitizeHexColor(raw, fallback = '#5865F2') {
  if (typeof raw === 'string' && /^#[0-9A-Fa-f]{6}$/.test(raw.trim())) {
    return raw.trim();
  }
  return fallback;
}

function buildCategoryOverwrites(guild, cat, createdRoles) {
  if (!cat.private) {
    return [];
  }

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ];

  const allowed = cat.allowRoles ?? [];
  for (const roleName of allowed) {
    const roleObj = resolveRoleByName(createdRoles, guild, roleName);
    if (roleObj) {
      overwrites.push({
        id: roleObj.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }
  }

  return overwrites;
}

function buildChannelOverwrites(guild, ch, createdRoles, isPrivateCat) {
  if (isPrivateCat) {
    return [];
  }

  if (ch.type === 'voice') {
    if (!ch.readOnlyForMembers) return [];
    const overwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.Connect],
      },
    ];
    for (const roleName of ch.allowedWriters ?? []) {
      const roleObj = resolveRoleByName(createdRoles, guild, roleName);
      if (roleObj) {
        overwrites.push({
          id: roleObj.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
        });
      }
    }
    return overwrites;
  }

  if (!ch.readOnlyForMembers) {
    return [];
  }

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages],
    },
  ];

  const writers = ch.allowedWriters ?? [];
  for (const roleName of writers) {
    const roleObj = resolveRoleByName(createdRoles, guild, roleName);
    if (roleObj) {
      overwrites.push({
        id: roleObj.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
        ],
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
  const fullPrompt = `Ești un designer profesionist de servere Discord. Primești orice instrucțiune / cerere de la utilizator în limba română (poate fi orice tematică sau cerințe exacte de roluri, categorii, canale și permisiuni) și construiești exact structura cerută.
Întoarce DOAR JSON valid (fără markdown, fără \`\`\`json, fără text suplimentar).

Format exact:
{
  "title": "Titlu scurt și clar",
  "roles": [
    { "name": "Owner / Admin", "color": "#FF3B30", "hoist": true, "staffOrMod": true },
    { "name": "Staff", "color": "#F59E0B", "hoist": true, "staffOrMod": true },
    { "name": "VIP / Membru", "color": "#5865F2", "hoist": true, "staffOrMod": false }
  ],
  "cats": [
    {
      "name": "📌 INFORMAȚII",
      "private": false,
      "allowRoles": [],
      "channels": [
        {
          "name": "reguli",
          "type": "text",
          "readOnlyForMembers": true,
          "allowedWriters": ["Owner / Admin", "Staff"]
        },
        {
          "name": "anunturi",
          "type": "text",
          "readOnlyForMembers": true,
          "allowedWriters": ["Owner / Admin", "Staff"]
        },
        {
          "name": "general",
          "type": "text",
          "readOnlyForMembers": false,
          "allowedWriters": []
        }
      ]
    }
  ]
}

Reguli stricte pentru permisiuni:
- Când utilizatorul spune că pe un canal / categorie "nu pot scrie toți" sau "scriu doar anumite roluri / admini / staff / VIP": setează "readOnlyForMembers": true pe acel canal și pune în "allowedWriters" numele EXACT al rolurilor din array-ul "roles" care au voie să scrie (ex: ["Owner / Admin", "Staff"]).
- Când utilizatorul cere o categorie sau un canal privat ("doar pentru staff / admini / anumite roluri"): setează "private": true și pune în "allowRoles" numele EXACT al rolurilor din "roles".
- Folosește EXACT aceleași nume de roluri în "roles", "allowRoles" și "allowedWriters" (nu prescurta și nu schimba denumirea între secțiuni).
- Numele canalelor: litere mici, cifre, cratimă (fără spații/diacritice). Pentru canalele vocale folosește "type": "voice".

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
    const safeColor = sanitizeHexColor(r.color);
    const roleObj =
      existing ??
      (await guild.roles.create({
        name: r.name,
        colors: { primaryColor: safeColor },
        hoist: r.hoist,
      }));
    createdRoles.set(r.name, roleObj);
  }

  for (const cat of structure.cats) {
    const overwrites = buildCategoryOverwrites(guild, cat, createdRoles);

    const existingCat = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && normalizeLookupName(c.name) === normalizeLookupName(cat.name)
    );

    const category = existingCat
      ? await existingCat.edit({ permissionOverwrites: overwrites }).catch(() => existingCat)
      : await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: overwrites,
        });

    for (const ch of cat.channels) {
      const isVoice = ch.type === 'voice';
      const targetType = isVoice ? ChannelType.GuildVoice : ChannelType.GuildText;
      const chOverwrites = buildChannelOverwrites(guild, ch, createdRoles, Boolean(cat.private));

      const existingCh = guild.channels.cache.find(
        (c) => c.type === targetType && c.name === ch.name
      );

      if (existingCh) {
        await existingCh
          .edit({
            parent: category.id,
            permissionOverwrites: chOverwrites,
          })
          .catch(() => null);
      } else {
        await guild.channels.create({
          name: ch.name,
          type: targetType,
          parent: category.id,
          permissionOverwrites: chOverwrites,
        });
      }
    }
  }

  return createdRoles;
}

function buildTicketPanelMessage() {
  const embed = new EmbedBuilder()
    .setTitle('🛒 Cumpără / Deschide Ticket')
    .setDescription(
      'Apasă pe butonul de mai jos ca să deschizi un ticket privat.\nAcolo poți vorbi direct despre comandă, produs sau detaliile de cumpărare.'
    )
    .setColor('#22C55E')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_OPEN_BTN_ID)
      .setLabel('Cumpără / Deschide Ticket')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

async function createTicketChannel(guild, openerUser) {
  const cleanUser = sanitizeChannelName(openerUser.username) || 'user';
  const shortSuffix = String(openerUser.id).slice(-4);
  const channelName = `ticket-${cleanUser}-${shortSuffix}`.slice(0, 95);

  let ticketCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && /^🎟️?\s*TICKETE/i.test(c.name)
  );

  if (!ticketCat) {
    ticketCat = await guild.channels
      .create({
        name: '🎟️ TICKETE',
        type: ChannelType.GuildCategory,
      })
      .catch(() => null);
  }

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: openerUser.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  if (guild.members.me) {
    overwrites.push({
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  const staffRoles = guild.roles.cache.filter(
    (r) =>
      r.id !== guild.roles.everyone.id &&
      !r.managed &&
      (r.permissions.has(PermissionFlagsBits.Administrator) ||
        r.permissions.has(PermissionFlagsBits.ManageGuild) ||
        /owner|admin|staff|mod/i.test(r.name))
  );

  for (const [, role] of staffRoles) {
    overwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: ticketCat?.id ?? null,
    topic: `ticket_owner:${openerUser.id}`,
    permissionOverwrites: overwrites,
  });

  const welcomeEmbed = new EmbedBuilder()
    .setTitle('🎟️ Ticket Deschis — Comandă / Cumpărare')
    .setDescription(
      `Salut <@${openerUser.id}>! Scrie aici ce vrei să cumperi și detaliile necesare.\nUn administrator / vânzător te va contacta în acest canal.\n\nCând ați terminat, apasă **Închide Ticket** ca să primești în PV tot ce s-a vorbit.`
    )
    .setColor('#5865F2')
    .setTimestamp();

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_CLOSE_BTN_ID)
      .setLabel('Închide Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({
    content: `<@${openerUser.id}>`,
    embeds: [welcomeEmbed],
    components: [closeRow],
  });

  return ticketChannel;
}

async function buildChannelTranscriptText(channel, guild, closedByUser) {
  const collected = [];
  let lastId = null;

  for (let page = 0; page < 10; page++) {
    const batch = await channel.messages
      .fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) })
      .catch(() => null);
    if (!batch || batch.size === 0) break;

    for (const [, msg] of batch) {
      collected.push(msg);
    }

    lastId = batch.last()?.id ?? null;
    if (batch.size < 100) break;
  }

  collected.reverse();

  const lines = [
    `TRANSCRIPT TICKET: #${channel.name}`,
    `Server: ${guild.name} (${guild.id})`,
    `Închis de: ${closedByUser.tag} (${closedByUser.id})`,
    `Data închiderii: ${new Date().toISOString()}`,
    `Total mesaje: ${collected.length}`,
    '====================================================',
    '',
  ];

  for (const msg of collected) {
    const timeStr = msg.createdAt.toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' });
    const authorTag = msg.author?.tag ?? 'Utilizator necunoscut';
    const contentText = msg.content ? msg.content : '';
    const embedTitles = (msg.embeds ?? [])
      .map((e) => e.title || e.description)
      .filter(Boolean)
      .join(' | ');
    const attachmentUrls = [...(msg.attachments?.values() ?? [])].map((a) => a.url);

    let line = `[${timeStr}] ${authorTag}`;
    if (contentText) line += `: ${contentText}`;
    if (embedTitles) line += ` [Embed: ${embedTitles}]`;
    if (attachmentUrls.length) line += ` [Atașamente: ${attachmentUrls.join(', ')}]`;
    if (!contentText && !embedTitles && !attachmentUrls.length) line += ': [Mesaj fără text]';

    lines.push(line);
  }

  return lines.join('\n');
}

async function handleTicketCloseButton(interaction, guild) {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction
      .reply({ content: 'Această acțiune poate fi folosită doar într-un canal de ticket.', flags: MessageFlags.Ephemeral })
      .catch(() => null);
    return;
  }

  await interaction
    .reply({
      content: '🔒 Închid ticketul, trimit în PV tot ce s-a vorbit și salvez în log tickete...',
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => null);

  const ownerMatch = /ticket_owner:(\d{15,22})/.exec(channel.topic ?? '');
  const ticketOwnerId = ownerMatch?.[1] ?? null;

  const transcriptText = await buildChannelTranscriptText(channel, guild, interaction.user);
  const safeFileName = `${sanitizeChannelName(channel.name) || 'ticket'}-transcript.txt`;

  const dmPayload = {
    content: `📄 **Transcript ticket închis (\`#${channel.name}\`)** — mai jos ai tot ce s-a vorbit:`,
    files: [new AttachmentBuilder(Buffer.from(transcriptText, 'utf8'), { name: safeFileName })],
  };

  if (ticketOwnerId) {
    const ownerUser = await interaction.client.users.fetch(ticketOwnerId).catch(() => null);
    if (ownerUser) {
      await ownerUser.send(dmPayload).catch(() => null);
    }
  }

  if (interaction.user.id !== ticketOwnerId) {
    await interaction.user.send(dmPayload).catch(() => null);
  }

  const logChannel = findTicketLogChannel(guild);
  if (logChannel && typeof logChannel.send === 'function') {
    const logEmbed = new EmbedBuilder()
      .setTitle('📋 Log Ticket Închis')
      .setDescription(
        [
          `**Canal:** \`#${channel.name}\``,
          `**Deschis de:** ${ticketOwnerId ? `<@${ticketOwnerId}> (\`${ticketOwnerId}\`)` : 'Necunoscut'}`,
          `**Închis de:** <@${interaction.user.id}> (\`${interaction.user.tag}\`)`,
        ].join('\n')
      )
      .setColor('#F59E0B')
      .setTimestamp();

    await logChannel
      .send({
        embeds: [logEmbed],
        files: [new AttachmentBuilder(Buffer.from(transcriptText, 'utf8'), { name: safeFileName })],
      })
      .catch(() => null);
  }

  await new Promise((r) => setTimeout(r, 1500));
  await channel.delete(`Ticket închis de ${interaction.user.tag}`).catch(() => null);
}

async function handleModerationCommand(interaction, guild, ephemeralOpts) {
  const actiune = interaction.options.getString('actiune', true);
  const member = interaction.options.getMember('membru');
  const userOption = interaction.options.getUser('membru');
  const rawUserId = (interaction.options.getString('user_id') ?? '').trim();
  const durataKey = interaction.options.getString('durata') ?? '10m';
  const deleteMsgKey = interaction.options.getString('sterge_mesaje') ?? 'none';
  const motiv = (interaction.options.getString('motiv') ?? 'Fără motiv specificat').slice(0, 400);

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));

  if (actiune === 'timeout') {
    if (!me || !me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await interaction
        .reply({ content: 'Botul nu are permisiunea **Moderate Members**.', ...ephemeralOpts })
        .catch(() => null);
      return;
    }
    if (!member) {
      await interaction
        .reply({ content: 'Selectează un membru valid de pe server pentru timeout.', ...ephemeralOpts })
        .catch(() => null);
      return;
    }
    if (member.id === guild.ownerId || (me && member.roles.highest.position >= me.roles.highest.position)) {
      await interaction
        .reply({ content: 'Nu pot aplica timeout acestui membru (are grad egal sau mai mare decât botul).', ...ephemeralOpts })
        .catch(() => null);
      return;
    }

    const durInfo = TIMEOUT_DURATIONS[durataKey] ?? TIMEOUT_DURATIONS['10m'];
    await member.timeout(durInfo.ms, motiv);
    await interaction
      .reply({
        content: `Timeout aplicat lui <@${member.id}> pentru **${durInfo.label}**. Motiv: *${motiv}*.`,
        ...ephemeralOpts,
      })
      .catch(() => null);
    return;
  }

  if (actiune === 'untimeout') {
    if (!me || !me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await interaction
        .reply({ content: 'Botul nu are permisiunea **Moderate Members**.', ...ephemeralOpts })
        .catch(() => null);
      return;
    }
    if (!member) {
      await interaction
        .reply({ content: 'Selectează un membru valid de pe server pentru a scoate timeout-ul.', ...ephemeralOpts })
        .catch(() => null);
      return;
    }

    await member.timeout(null, motiv);
    await interaction
      .reply({
        content: `Am scos timeout-ul de la <@${member.id}>. Motiv: *${motiv}*.`,
        ...ephemeralOpts,
      })
      .catch(() => null);
    return;
  }

  if (actiune === 'kick') {
    if (!me || !me.permissions.has(PermissionFlagsBits.KickMembers)) {
      await interaction
        .reply({ content: 'Botul nu are permisiunea **Kick Members**.', ...ephemeralOpts })
        .catch(() => null);
      return;
    }
    if (!member) {
      await interaction
        .reply({ content: 'Selectează un membru valid de pe server pentru kick.', ...ephemeralOpts })
        .catch(() => null);
      return;
    }
    if (!member.kickable) {
      await interaction
        .reply({ content: 'Nu pot da kick acestui membru (verifică ierarhia rolurilor).', ...ephemeralOpts })
        .catch(() => null);
      return;
    }

    await member.kick(motiv);
    await interaction
      .reply({
        content: `Membrul **${member.user.tag}** a primit kick. Motiv: *${motiv}*.`,
        ...ephemeralOpts,
      })
      .catch(() => null);
    return;
  }

  if (actiune === 'ban') {
    if (!me || !me.permissions.has(PermissionFlagsBits.BanMembers)) {
      await interaction
        .reply({ content: 'Botul nu are permisiunea **Ban Members**.', ...ephemeralOpts })
        .catch(() => null);
      return;
    }

    const targetId = member?.id ?? userOption?.id ?? rawUserId;
    if (!targetId) {
      await interaction
        .reply({ content: 'Specifică un `membru` sau un `user_id` pentru ban.', ...ephemeralOpts })
        .catch(() => null);
      return;
    }

    if (member && !member.bannable) {
      await interaction
        .reply({ content: 'Nu pot bana acest membru (verifică ierarhia rolurilor).', ...ephemeralOpts })
        .catch(() => null);
      return;
    }

    const delInfo = BAN_DELETE_SECONDS[deleteMsgKey] ?? BAN_DELETE_SECONDS.none;
    await guild.members.ban(targetId, {
      deleteMessageSeconds: delInfo.seconds,
      reason: motiv,
    });

    await interaction
      .reply({
        content: `Utilizatorul \`${targetId}\` a fost banat (${delInfo.label}). Motiv: *${motiv}*.`,
        ...ephemeralOpts,
      })
      .catch(() => null);
    return;
  }

  if (actiune === 'unban') {
    if (!me || !me.permissions.has(PermissionFlagsBits.BanMembers)) {
      await interaction
        .reply({ content: 'Botul nu are permisiunea **Ban Members**.', ...ephemeralOpts })
        .catch(() => null);
      return;
    }

    const targetId = rawUserId || userOption?.id || '';
    if (!/^\d{15,22}$/.test(targetId)) {
      await interaction
        .reply({ content: 'Pentru **unban**, introdu un `user_id` numeric valid (ex. `123456789012345678`).', ...ephemeralOpts })
        .catch(() => null);
      return;
    }

    await guild.members.unban(targetId, motiv);
    await interaction
      .reply({
        content: `Am scos ban-ul pentru utilizatorul \`${targetId}\`. Motiv: *${motiv}*.`,
        ...ephemeralOpts,
      })
      .catch(() => null);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.on(Events.Error, (err) => {
  console.error('Discord Client Error:', err);
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot online: ${readyClient.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('Comenzile au fost încărcate.');
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guild) return;
  const guild = interaction.guild;
  const ephemeralOpts = { flags: MessageFlags.Ephemeral };

  try {
    if (interaction.isButton()) {
      if (interaction.customId === TICKET_OPEN_BTN_ID) {
        const existingChannel = guild.channels.cache.find(
          (c) => c.type === ChannelType.GuildText && String(c.topic ?? '').includes(`ticket_owner:${interaction.user.id}`)
        );

        if (existingChannel) {
          await interaction
            .reply({
              content: `Ai deja un ticket deschis aici: <#${existingChannel.id}>.`,
              ...ephemeralOpts,
            })
            .catch(() => null);
          return;
        }

        const ticketChannel = await createTicketChannel(guild, interaction.user);
        await interaction
          .reply({
            content: `Ticketul tău a fost deschis: <#${ticketChannel.id}>.`,
            ...ephemeralOpts,
          })
          .catch(() => null);
        return;
      }

      if (interaction.customId === TICKET_CLOSE_BTN_ID) {
        await handleTicketCloseButton(interaction, guild);
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    if (commandName === 'custom') {
      await interaction.deferReply(ephemeralOpts);

      const descriere = interaction.options.getString('descriere', true);
      const plan = await generateFullCustomPlanWithAI(descriere);
      await applyServerStructure(guild, plan);

      const rolesList = plan.roles.map((r) => `\`${r.name}\``).join(', ');
      const catsList = plan.cats
        .map((c) => `• **${c.name}** (${c.channels.length} canale${c.private ? ', privat' : ''})`)
        .join('\n');

      await interaction
        .editReply(
          `Gata! Am generat cu AI **${plan.title}**.\n**Roluri create:** ${rolesList}\n${catsList}`
        )
        .catch(() => null);
      return;
    }

    if (commandName === 'ticket-panel') {
      const canal = interaction.options.getChannel('canal') ?? interaction.channel;
      if (!canal || typeof canal.send !== 'function') {
        await interaction
          .reply({ content: 'Selectează un canal text valid.', ...ephemeralOpts })
          .catch(() => null);
        return;
      }

      await canal.send(buildTicketPanelMessage());
      await interaction
        .reply({ content: `Panoul de tickete a fost postat în <#${canal.id}>.`, ...ephemeralOpts })
        .catch(() => null);
      return;
    }

    if (commandName === 'mod') {
      await handleModerationCommand(interaction, guild, ephemeralOpts);
      return;
    }

    if (commandName === 'grad') {
      const member = interaction.options.getMember('membru');
      const role = interaction.options.getRole('rol', true);
      const actiune = interaction.options.getString('actiune', true);

      if (!member) {
        await interaction.reply({ content: 'Nu am găsit membrul pe server.', ...ephemeralOpts }).catch(() => null);
        return;
      }

      if (actiune === 'add') {
        await member.roles.add(role);
        await interaction
          .reply({
            content: `Am acordat gradul **${role.name}** lui <@${member.id}>.`,
            ...ephemeralOpts,
          })
          .catch(() => null);
      } else {
        await member.roles.remove(role);
        await interaction
          .reply({
            content: `Am scos gradul **${role.name}** de la <@${member.id}>.`,
            ...ephemeralOpts,
          })
          .catch(() => null);
      }
      return;
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
      await interaction.reply({ content: `Drop postat în <#${canal.id}>.`, ...ephemeralOpts }).catch(() => null);
      return;
    }

    if (commandName === 'wipe') {
      const confirmare = interaction.options.getString('confirmare', true);

      if (confirmare !== 'STERGE TOT') {
        await interaction
          .reply({
            content: 'Anulat. Ca să confirmi ștergerea totală, scrie exact `STERGE TOT` la opțiunea `confirmare`.',
            ...ephemeralOpts,
          })
          .catch(() => null);
        return;
      }

      await interaction.reply({ content: 'Șterg tot...', ...ephemeralOpts }).catch(() => null);

      const channels = await guild.channels.fetch().catch(() => null);
      let deletedChannels = 0;

      if (channels) {
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
      }

      const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
      const roles = await guild.roles.fetch().catch(() => null);
      let deletedRoles = 0;

      if (roles) {
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
      }

      console.log(`Wipe complet: ${deletedChannels} canale/categorii șterse, ${deletedRoles} roluri șterse.`);
      await interaction
        .editReply(
          `Wipe complet: **${deletedChannels}** canale/categorii șterse și **${deletedRoles}** roluri șterse. Nu am creat nimic nou.`
        )
        .catch(() => null);
      return;
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
