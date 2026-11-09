// Endpoint to verify custom API keys or local Ollama connectivity.
// Tests the connection and measures round-trip latency.

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      provider: 'default' | 'openrouter' | 'openai' | 'groq' | 'anthropic' | 'ollama';
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };

    const startTime = Date.now();

    if (body.provider === 'ollama') {
      const baseUrl = (body.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
      try {
        // First check tags / models endpoint
        const tagsRes = await fetch(`${baseUrl}/api/tags`, { method: 'GET' });
        if (!tagsRes.ok) {
          throw new Error(`Ollama responded with HTTP ${tagsRes.status}`);
        }
        const tagsData = await tagsRes.json();
        const models = Array.isArray(tagsData.models)
          ? tagsData.models.map((m: { name: string }) => m.name)
          : [];

        const latency = Date.now() - startTime;
        return NextResponse.json({
          success: true,
          provider: 'ollama',
          latencyMs: latency,
          message: `Connected to Local Ollama successfully! (${models.length} local models detected)`,
          availableModels: models,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to connect to Ollama.';
        return NextResponse.json(
          {
            success: false,
            error: `Failed to reach Ollama at ${baseUrl}. Ensure Ollama is running (e.g. 'ollama serve') and allows CORS. Error: ${msg}`,
          },
          { status: 502 },
        );
      }
    }

    if (body.provider === 'groq') {
      if (!body.apiKey?.trim()) {
        return NextResponse.json({ error: 'Please enter a valid Groq API key.' }, { status: 400 });
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${body.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: body.model || 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Say "Ready" in one word.' }],
          max_tokens: 5,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return NextResponse.json(
          { success: false, error: errData.error?.message || `Groq returned HTTP ${res.status}` },
          { status: res.status },
        );
      }

      const latency = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        provider: 'groq',
        latencyMs: latency,
        message: 'Groq API key verified! Fast responses enabled.',
      });
    }

    if (body.provider === 'openai') {
      if (!body.apiKey?.trim()) {
        return NextResponse.json({ error: 'Please enter a valid OpenAI API key.' }, { status: 400 });
      }

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${body.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: body.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "Ready" in one word.' }],
          max_tokens: 5,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return NextResponse.json(
          { success: false, error: errData.error?.message || `OpenAI returned HTTP ${res.status}` },
          { status: res.status },
        );
      }

      const latency = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        provider: 'openai',
        latencyMs: latency,
        message: 'OpenAI API key verified!',
      });
    }

    if (body.provider === 'openrouter') {
      const key = body.apiKey?.trim() || process.env.OPENROUTER_API_KEY;
      if (!key) {
        return NextResponse.json({ error: 'Please enter an OpenRouter API key.' }, { status: 400 });
      }

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: body.model || 'openrouter/auto',
          messages: [{ role: 'user', content: 'Say "Ready" in one word.' }],
          max_tokens: 5,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return NextResponse.json(
          { success: false, error: errData.error?.message || `OpenRouter returned HTTP ${res.status}` },
          { status: res.status },
        );
      }

      const latency = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        provider: 'openrouter',
        latencyMs: latency,
        message: 'OpenRouter personal key verified!',
      });
    }

    return NextResponse.json({
      success: true,
      provider: 'default',
      message: 'Using LearnMate default tiered models with automatic fallbacks.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Testing connection failed.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
