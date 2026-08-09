// Shared wrapper around the OpenRouter chat completion API.
// All routes use this helper so the app has one consistent place to configure the model,
// inject the API key, and normalize the response payload.
const OPENROUTER_API_URL =
  'https://openrouter.ai/api/v1/chat/completions';

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const rawApiKey = process.env.OPENROUTER_API_KEY;
  const model =
    process.env.OPENROUTER_MODEL || 'anthropic/claude-3-haiku';

  if (!rawApiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is missing from environment variables.',
    );
  }

  // Strip accidental quotes or surrounding whitespace from the key
  const apiKey = rawApiKey.replace(/['"]/g, '').trim();

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'LearnMate',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenRouter API error: ${errorData}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('OpenRouter API returned no usable content.');
  }

  return content;
}