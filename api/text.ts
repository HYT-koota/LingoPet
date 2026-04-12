type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type TextRequestBody = {
  messages?: ChatMessage[];
  jsonMode?: boolean;
};

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function normalizeBody(rawBody: unknown): TextRequestBody {
  if (!rawBody) return {};
  if (typeof rawBody === 'string') {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }
  if (typeof rawBody === 'object') {
    return rawBody as TextRequestBody;
  }
  return {};
}

function cleanJsonContent(content: string): string {
  return content.replace(/```json/g, '').replace(/```/g, '').trim();
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  const body = normalizeBody(req.body);
  const messages = body.messages;
  const jsonMode = body.jsonMode !== false;

  if (!Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { ok: false, error: 'Invalid request body: messages is required.' });
  }

  const apiKey = process.env.TEXT_API_KEY || process.env.VITE_TEXT_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, {
      ok: false,
      error: 'Server missing TEXT_API_KEY. Configure TEXT_API_KEY in Vercel environment variables.',
    });
  }

  const baseUrl = (process.env.TEXT_API_BASE_URL || process.env.VITE_TEXT_API_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const model = process.env.TEXT_API_MODEL || process.env.VITE_TEXT_API_MODEL || 'deepseek-chat';

  const controller = new AbortController();
  const timeoutMs = 20000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return sendJson(res, 502, {
        ok: false,
        error: `Upstream text API failed [${response.status}]: ${errorBody.substring(0, 200)}`,
      });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return sendJson(res, 502, { ok: false, error: 'Upstream text API returned empty content.' });
    }

    if (!jsonMode) {
      return sendJson(res, 200, { ok: true, data: content });
    }

    try {
      const parsed = JSON.parse(cleanJsonContent(content));
      return sendJson(res, 200, { ok: true, data: parsed });
    } catch {
      return sendJson(res, 502, { ok: false, error: 'Model did not return valid JSON.' });
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return sendJson(res, 504, { ok: false, error: `Text API request timed out (${timeoutMs}ms).` });
    }
    return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    clearTimeout(timeoutId);
  }
}
