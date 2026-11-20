async function checkGeminiConnection() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('Gemini NECONECTAT: lipsește GEMINI_API_KEY.');
    return;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Răspunde cu un singur cuvânt: OK' }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 10,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`Gemini NECONECTAT (${response.status}): ${errText.slice(0, 200)}`);
      return;
    }

    const data = await response.json();
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

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot online: ${readyClient.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('Comenzile au fost încărcate.');

  await checkGeminiConnection();
});
