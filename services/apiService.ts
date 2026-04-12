export const CURRENT_CONFIG = {
  textModel: (import.meta as any).env.VITE_TEXT_API_MODEL || 'deepseek-chat',
  textBaseUrl: ((import.meta as any).env.VITE_TEXT_API_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
  hasTextKey: !!((import.meta as any).env.VITE_TEXT_API_KEY && (import.meta as any).env.VITE_TEXT_API_KEY !== ''),
  imageModel: (import.meta as any).env.VITE_IMAGE_API_MODEL || 'Qwen/Qwen-Image',
  imageBaseUrl: ((import.meta as any).env.VITE_IMAGE_API_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/$/, ''),
  hasImageKey: !!((import.meta as any).env.VITE_IMAGE_API_KEY && (import.meta as any).env.VITE_IMAGE_API_KEY !== '')
};

console.log('%c LingoPet startup diagnostics %c', 'background:#FFAE0A;color:white;padding:2px 5px;border-radius:3px', '');
console.log('-> Text model:', CURRENT_CONFIG.textModel);
console.log('-> Text base URL:', CURRENT_CONFIG.textBaseUrl);
console.log('-> Text API key:', CURRENT_CONFIG.hasTextKey ? 'READY' : 'MISSING');
console.log('-> Image model:', CURRENT_CONFIG.imageModel);
console.log('-> Image base URL:', CURRENT_CONFIG.imageBaseUrl);
console.log('-> Image API key:', CURRENT_CONFIG.hasImageKey ? 'READY' : 'MISSING');

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

async function callOpenAITextAPI(messages: any[], jsonMode: boolean = true) {
  const apiKey = (import.meta as any).env.VITE_TEXT_API_KEY;
  if (!apiKey) throw new Error('Missing VITE_TEXT_API_KEY');

  const url = `${CURRENT_CONFIG.textBaseUrl}/v1/chat/completions`;
  const payload: any = {
    model: CURRENT_CONFIG.textModel,
    messages,
    temperature: 0.7
  };

  const timeoutMs = 20000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Text API request timed out (${timeoutMs}ms)`);
    }
    throw error;
  }
  clearTimeout(timeoutId);

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

async function callImageAPI(prompt: string): Promise<string> {
  const apiKey = (import.meta as any).env.VITE_IMAGE_API_KEY;
  if (!apiKey) throw new Error('Missing VITE_IMAGE_API_KEY');

  const url = `${CURRENT_CONFIG.imageBaseUrl}/images/generations`;
  const timeoutMs = 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: CURRENT_CONFIG.imageModel,
        prompt,
        image_size: '512x512',
        num_inference_steps: 20,
        guidance_scale: 7.5,
        num_images: 1
      }),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Image API request timed out (${timeoutMs}ms)`);
    }
    throw error;
  }
  clearTimeout(timeoutId);

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

export const queryDictionary = async (userInput: string) => {
  const messages = [
    {
      role: 'system',
      content: 'You are a professional language tutor. Respond with a valid JSON object only, no extra text. Format: { "identifiedWord": "word", "definition": "English meaning", "translation": "Chinese translation", "example": "example sentence", "visualDescription": "scene for AI image" }'
    },
    { role: 'user', content: `Explain: "${userInput}"` }
  ];
  return await callOpenAITextAPI(messages);
};

export const generateShortTranslation = async (word: string, definition?: string): Promise<string> => {
  if (!word.trim()) return '';

  const messages = [
    {
      role: 'system',
      content: 'You are a bilingual dictionary assistant. Return valid JSON only in this format: { "translation": "short Chinese translation" }. Keep translation concise (usually 2-8 Chinese characters).'
    },
    {
      role: 'user',
      content: `Word: ${word}\nDefinition: ${definition || ''}`
    }
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
  const messages = [
    {
      role: 'system',
      content: 'You are a cute virtual pet. Respond with a valid JSON object only, no extra text. Format: { "text": "what the pet says", "mood": "happy|sleepy|excited|proud" }'
    },
    { role: 'user', content: `The pet just experienced: ${trigger}` }
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
