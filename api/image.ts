type ImageRequestBody = {
  prompt?: string;
};

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function normalizeBody(rawBody: unknown): ImageRequestBody {
  if (!rawBody) return {};
  if (typeof rawBody === 'string') {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }
  if (typeof rawBody === 'object') {
    return rawBody as ImageRequestBody;
  }
  return {};
}

function normalizeImageUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('http://')) {
    return `https://${trimmed.slice('http://'.length)}`;
  }
  return trimmed;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  const body = normalizeBody(req.body);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return sendJson(res, 400, { ok: false, error: 'Invalid request body: prompt is required.' });
  }

  const apiKey = process.env.IMAGE_API_KEY || process.env.VITE_IMAGE_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, {
      ok: false,
      error: 'Server missing IMAGE_API_KEY. Configure IMAGE_API_KEY in Vercel environment variables.',
    });
  }

  const baseUrl = (process.env.IMAGE_API_BASE_URL || process.env.VITE_IMAGE_API_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/$/, '');
  const model = process.env.IMAGE_API_MODEL || process.env.VITE_IMAGE_API_MODEL || 'Qwen/Qwen-Image';

  const controller = new AbortController();
  const timeoutMs = 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        image_size: '512x512',
        // Slightly lower steps to improve response latency and reduce timeout risk.
        num_inference_steps: 16,
        guidance_scale: 7.5,
        num_images: 1,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return sendJson(res, 502, {
        ok: false,
        error: `Upstream image API failed [${response.status}]: ${errorBody.substring(0, 200)}`,
      });
    }

    const data = await response.json();
    const imageUrl = data?.data?.[0]?.url;
    if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
      return sendJson(res, 502, { ok: false, error: 'Upstream image API returned no URL.' });
    }

    return sendJson(res, 200, { ok: true, data: { url: normalizeImageUrl(imageUrl) } });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return sendJson(res, 504, { ok: false, error: `Image API request timed out (${timeoutMs}ms).` });
    }
    return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    clearTimeout(timeoutId);
  }
}
