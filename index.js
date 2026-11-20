async function callGeminiWithRetry(payload, maxRetries = 3) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Lipsește variabila GEMINI_API_KEY.');
  }

  let lastErrorText = '';
  let lastStatus = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(buildGeminiUrl(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return response.json();
    }

    lastStatus = response.status;
    lastErrorText = await response.text().catch(() => '');

    if (response.status === 503 && attempt < maxRetries) {
      const waitMs = attempt * 2000;
      console.warn(`Gemini 503 (încercarea ${attempt}/${maxRetries}). Reîncerc în ${waitMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    break;
  }

  throw new Error(`Eroare Gemini API (${lastStatus}): ${lastErrorText.slice(0, 200)}`);
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

  const roles = Array.isArray(parsed.roles) && parsed.roles.length
    ? parsed.roles.slice(0, 10).map((r, idx) => ({
        name: String(r.name || `Grad ${idx + 1}`).slice(0, 60),
        color: sanitizeHexColor(r.color),
        hoist: Boolean(r.hoist),
        staffOrMod: Boolean(r.staffOrMod),
      }))
    : RESELL_VARIANTS['full-resell'].roles;

  const cats = Array.isArray(parsed.cats) && parsed.cats.length
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
