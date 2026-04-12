type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const isLocalDev =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const CURRENT_CONFIG = {
  aiMode: 'server_proxy',
  textModel: (import.meta as any).env.VITE_TEXT_API_MODEL || 'deepseek-chat',
  textBaseUrl: ((import.meta as any).env.VITE_TEXT_API_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
  hasDirectTextKey: !!((import.meta as any).env.VITE_TEXT_API_KEY && (import.meta as any).env.VITE_TEXT_API_KEY !== ''),
  imageModel: (import.meta as any).env.VITE_IMAGE_API_MODEL || 'Qwen/Qwen-Image',
  imageBaseUrl: ((import.meta as any).env.VITE_IMAGE_API_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/$/, ''),
  hasDirectImageKey: !!((import.meta as any).env.VITE_IMAGE_API_KEY && (import.meta as any).env.VITE_IMAGE_API_KEY !== ''),
};

const MISSING_DIRECT_ENV_MESSAGES: Record<string, string> = {
  VITE_TEXT_API_KEY:
    'Missing VITE_TEXT_API_KEY for local direct-call fallback. For deployed environments, configure TEXT_API_KEY on server side.',
  VITE_IMAGE_API_KEY:
    'Missing VITE_IMAGE_API_KEY for local direct-call fallback. For deployed environments, configure IMAGE_API_KEY on server side.',
};

console.log('%c LingoPet startup diagnostics %c', 'background:#FFAE0A;color:white;padding:2px 5px;border-radius:3px', '');
console.log('-> AI mode:', 'Server proxy (/api/text, /api/image)');
console.log('-> Text model hint:', CURRENT_CONFIG.textModel);
console.log('-> Image model hint:', CURRENT_CONFIG.imageModel);
console.log('-> Local direct text key fallback:', CURRENT_CONFIG.hasDirectTextKey ? 'READY' : 'MISSING');
console.log('-> Local direct image key fallback:', CURRENT_CONFIG.hasDirectImageKey ? 'READY' : 'MISSING');

function getPlaceholder(text: string, color: string = '#E5E7EB') {
  const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#F9FAFB"/><rect x="156" y="156" width="200" height="200" rx="40" fill="${color}" opacity="0.2"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20" fill="${color}">${text}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function normalizeImageUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('http://')) {
    return `https://${trimmed.slice('http://'.length)}`;
  }
  return trimmed;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callTextViaProxy(messages: ChatMessage[], jsonMode: boolean): Promise<any> {
  const timeoutMs = 25000;
  let response: Response;
  try {
    response = await fetchWithTimeout(
      '/api/text',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, jsonMode }),
      },
      timeoutMs
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Proxy text request timed out (${timeoutMs}ms)`);
    }
    throw error;
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    const errorMessage = payload?.error || `Text proxy request failed [${response.status}]`;
    throw new Error(errorMessage);
  }
  return payload.data;
}

async function callImageViaProxy(prompt: string): Promise<string> {
  const timeoutMs = 35000;
  let response: Response;
  try {
    response = await fetchWithTimeout(
      '/api/image',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      },
      timeoutMs
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Proxy image request timed out (${timeoutMs}ms)`);
    }
    throw error;
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    const errorMessage = payload?.error || `Image proxy request failed [${response.status}]`;
    throw new Error(errorMessage);
  }

  const imageUrl = payload?.data?.url;
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Image proxy returned no URL');
  }
  return normalizeImageUrl(imageUrl);
}

async function callOpenAITextAPIDirect(messages: ChatMessage[], jsonMode: boolean = true) {
  const apiKey = (import.meta as any).env.VITE_TEXT_API_KEY;
  if (!apiKey) throw new Error(MISSING_DIRECT_ENV_MESSAGES.VITE_TEXT_API_KEY);

  const url = `${CURRENT_CONFIG.textBaseUrl}/v1/chat/completions`;
  const payload: any = {
    model: CURRENT_CONFIG.textModel,
    messages,
    temperature: 0.7,
  };

  const timeoutMs = 20000;
  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      timeoutMs
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Text API request timed out (${timeoutMs}ms)`);
    }
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`[${response.status}] Text API request failed: ${errorBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!jsonMode) return content;

  try {
    const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanContent);
  } catch {
    throw new Error('Model did not return valid JSON');
  }
}

async function callImageAPIDirect(prompt: string): Promise<string> {
  const apiKey = (import.meta as any).env.VITE_IMAGE_API_KEY;
  if (!apiKey) throw new Error(MISSING_DIRECT_ENV_MESSAGES.VITE_IMAGE_API_KEY);

  const url = `${CURRENT_CONFIG.imageBaseUrl}/images/generations`;
  const timeoutMs = 30000;
  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: CURRENT_CONFIG.imageModel,
          prompt,
          image_size: '512x512',
          num_inference_steps: 20,
          guidance_scale: 7.5,
          num_images: 1,
        }),
      },
      timeoutMs
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Image API request timed out (${timeoutMs}ms)`);
    }
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`[${response.status}] Image API request failed: ${errorBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const imageUrl = data.data?.[0]?.url;
  if (!imageUrl) {
    throw new Error('Image API returned no URL');
  }
  return normalizeImageUrl(imageUrl);
}

async function callOpenAITextAPI(messages: ChatMessage[], jsonMode: boolean = true) {
  try {
    return await callTextViaProxy(messages, jsonMode);
  } catch (proxyError) {
    if (isLocalDev && CURRENT_CONFIG.hasDirectTextKey) {
      console.warn('[apiService] /api/text unavailable in local dev, falling back to direct text API call.');
      return callOpenAITextAPIDirect(messages, jsonMode);
    }
    throw proxyError;
  }
}

async function callImageAPI(prompt: string): Promise<string> {
  try {
    return await callImageViaProxy(prompt);
  } catch (proxyError) {
    if (isLocalDev && CURRENT_CONFIG.hasDirectImageKey) {
      console.warn('[apiService] /api/image unavailable in local dev, falling back to direct image API call.');
      return callImageAPIDirect(prompt);
    }
    throw proxyError;
  }
}

export const queryDictionary = async (userInput: string) => {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a professional language tutor. Respond with a valid JSON object only, no extra text. Format: { "identifiedWord": "word", "definition": "English meaning", "translation": "Chinese translation", "example": "example sentence", "visualDescription": "scene for AI image" }',
    },
    { role: 'user', content: `Explain: "${userInput}"` },
  ];
  return await callOpenAITextAPI(messages);
};

export const generateShortTranslation = async (word: string, definition?: string): Promise<string> => {
  if (!word.trim()) return '';

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a bilingual dictionary assistant. Return valid JSON only in this format: { "translation": "short Chinese translation" }. Keep translation concise (usually 2-8 Chinese characters).',
    },
    {
      role: 'user',
      content: `Word: ${word}\nDefinition: ${definition || ''}`,
    },
  ];

  try {
    const result = await callOpenAITextAPI(messages);
    const translation = result?.translation;
    return typeof translation === 'string' ? translation.trim() : '';
  } catch (error) {
    console.error(`[generateShortTranslation] Failed for "${word}":`, error);
    return '';
  }
};

export const generateCardImage = async (word: string, context?: string, visualDescription?: string): Promise<string> => {
  try {
    const prompt = `3D digital art: ${word}. ${visualDescription || context}. White background, simple background, high quality.`;
    return await callImageAPI(prompt);
  } catch (error) {
    console.error('[generateCardImage] Image failed:', error);
    return getPlaceholder(word, '#FBBF24');
  }
};

export const generatePetSprite = async (stage: number): Promise<string> => {
  const stages = ['mystical glowing egg', 'cute baby creature', 'teen creature', 'mighty guardian character'];
  const prompt = `Cute 3D ${stages[stage]}, character design, white background, simple background, high quality, centered.`;
  try {
    return await callImageAPI(prompt);
  } catch (error) {
    console.error(`[generatePetSprite] Failed for stage ${stage}:`, error);
    return getPlaceholder('Pet', '#FCD34D');
  }
};

export const generatePetReaction = async (petState: any, stats: any, trigger: string) => {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a cute virtual pet. Respond with a valid JSON object only, no extra text. Format: { "text": "what the pet says", "mood": "happy|sleepy|excited|proud" }',
    },
    { role: 'user', content: `The pet just experienced: ${trigger}` },
  ];
  try {
    return await callOpenAITextAPI(messages);
  } catch {
    return { text: 'Wow!', mood: 'happy' };
  }
};

export const generatePostcard = async (petName: string): Promise<string> => {
  const prompt = `Anime style postcard illustration of ${petName} at a beautiful landmark, travel postcard, white background.`;
  try {
    return await callImageAPI(prompt);
  } catch {
    return getPlaceholder('Postcard', '#6366F1');
  }
};
