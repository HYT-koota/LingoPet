type ImageRequestBody = {
  prompt?: string;
  fallbackText?: string;
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildPlaceholderImage(text: string, color: string = '#FBBF24'): string {
  const safeText = escapeXml((text || 'Image').trim().slice(0, 18) || 'Image');
  const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#F9FAFB"/><rect x="156" y="156" width="200" height="200" rx="40" fill="${color}" opacity="0.2"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20" fill="${color}">${safeText}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function parseUpstreamErrorBody(errorBody: string): any {
  try {
    return JSON.parse(errorBody);
  } catch {
    return null;
  }
}

function isQuotaExhausted(status: number, parsedBody: any, errorBody: string): boolean {
  if (status !== 403) return false;

  const code = parsedBody?.code;
  if (code === 30001) return true;

  const msg = String(parsedBody?.message || errorBody || '').toLowerCase();
  return msg.includes('insufficient') || msg.includes('balance');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
  }

  const body = normalizeBody(req.body);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const fallbackText = typeof body.fallbackText === 'string' ? body.fallbackText.trim() : 'Image';
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
      const parsedErrorBody = parseUpstreamErrorBody(errorBody);

      // Quota/balance exhaustion is an operational condition, not a user input failure.
      // Return a placeholder image so review flow keeps moving on all clients.
      if (isQuotaExhausted(response.status, parsedErrorBody, errorBody)) {
        return sendJson(res, 200, {
          ok: true,
          data: { url: buildPlaceholderImage(fallbackText || 'Image') },
          meta: { degraded: true, reason: 'quota_exhausted' },
        });
      }

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
