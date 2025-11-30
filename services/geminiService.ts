

// --- Generic API Service (Split Text & Image) ---

// Helper to clean config values (remove spaces, trailing slashes)
const cleanUrl = (url?: string) => url ? url.trim().replace(/\/+$/, '') : '';
const cleanVal = (val?: string) => val ? val.trim() : '';

// 1. Text Configuration (Chat / Definitions)
const TEXT_KEY = cleanVal(process.env.TEXT_API_KEY);
const TEXT_BASE_URL = cleanUrl(process.env.TEXT_API_BASE_URL) || 'https://api.openai.com/v1';
const TEXT_MODEL = cleanVal(process.env.TEXT_API_MODEL) || 'gpt-3.5-turbo';

// 2. Image Configuration (Visuals / Pet Sprites)
const IMAGE_KEY = cleanVal(process.env.IMAGE_API_KEY);
const IMAGE_BASE_URL = cleanUrl(process.env.IMAGE_API_BASE_URL) || 'https://api.openai.com/v1';
const IMAGE_MODEL = cleanVal(process.env.IMAGE_API_MODEL) || 'dall-e-3';

// Diagnostics for UI
export const CURRENT_CONFIG = {
    textModel: TEXT_MODEL,
    imageModel: IMAGE_MODEL,
    hasTextKey: !!TEXT_KEY && TEXT_KEY.length > 0, 
    hasImageKey: !!IMAGE_KEY && IMAGE_KEY.length > 0
};

// --- Helper: Clean JSON ---
function parseJSON(text: string) {
    try {
        // Attempt strict parse
        return JSON.parse(text);
    } catch (e) {
        // Fallback: Try to extract JSON from code blocks ```json ... ```
        const match = text.match(/```json([\s\S]*?)```/);
        if (match && match[1]) {
            try { return JSON.parse(match[1]); } catch(err) {}
        }
        // Fallback: Try to find the first { and last }
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first >= 0 && last > first) {
             try { return JSON.parse(text.substring(first, last + 1)); } catch(err) {}
        }
        throw new Error("Failed to parse JSON from API response");
    }
}

// --- Helper: Generate UUID (Safe) ---
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// --- Helper: Create Clean SVG Placeholder ---
function getPlaceholder(text: string, color: string = "#FFD700") {
    const svg = `
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <rect width="512" height="512" fill="#F3F4F6"/>
        <circle cx="256" cy="256" r="100" fill="${color}" opacity="0.5"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#6B7280" font-weight="bold">${text}</text>
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// --- TEXT API CALLS ---
async function fetchTextCompletion(
    systemPrompt: string, 
    userPrompt: string, 
    jsonMode: boolean = false
): Promise<string> {
    if (!TEXT_KEY) throw new Error("Text API Key is missing");

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEXT_KEY}`
    };

    const body: any = {
        model: TEXT_MODEL,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
    };

    if (jsonMode && (TEXT_MODEL.toLowerCase().includes('gpt') || TEXT_MODEL.toLowerCase().includes('deepseek'))) {
        body.response_format = { type: "json_object" };
    }

    // Ensure we handle /v1 correctly for Chat
    // If base url ends in /v1, don't append it again. If not, append it.
    // Standard OpenAI chat endpoint is /v1/chat/completions
    const baseUrl = TEXT_BASE_URL.endsWith('/v1') ? TEXT_BASE_URL : `${TEXT_BASE_URL}/v1`;
    const endpoint = `${baseUrl}/chat/completions`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[Text API Error] Status: ${response.status}`, errText);
            throw new Error(`Text API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    } catch (e: any) {
        console.error("Text API Request Failed:", e);
        throw e;
    }
}

// --- IMAGE API CALLS ---
async function fetchImageGeneration(prompt: string): Promise<string> {
    if (!IMAGE_KEY) throw new Error("Image API Key is missing");

    // Seed Limit: Signed 32-bit Integer Max
    const randomSeed = Math.floor(Math.random() * 2147483647);

    // Prompt Cleanup
    const fullPrompt = `${prompt}, (masterpiece), (best quality), highres, 8k, simple background`;
    const negativePrompt = "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, humanoid, human face, girl, boy, man, woman";

    // Detect if we are likely using a Native MiniMax/SeaDream model
    const isNativePayload = IMAGE_MODEL.toLowerCase().includes('seedream') || IMAGE_MODEL.toLowerCase().includes('minimax');

    // 构造请求体
    let requestBody: any;
    let endpoint = "";

    if (isNativePayload) {
        // --- SeaDream / MiniMax Native Structure ---
        requestBody = {
            model: IMAGE_MODEL,
            request_id: generateUUID(),
            payload: {
                prompt: fullPrompt + " --no " + negativePrompt, // In-prompt negative since API doesn't support param
                size: "1024x1024", 
                seed: randomSeed,
                guidance_scale: 2.5,
                add_watermark: false,
                response_format: "url"
            }
        };

        // --- Endpoint Strategy for Native ---
        // Native MiniMax usually expects: host/v1/text_to_image
        // We strip /v1 from the base URL if it exists, then append /v1/text_to_image manually
        // to ensure we get the structure right regardless of user input.
        const rootUrl = IMAGE_BASE_URL.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
        endpoint = `${rootUrl}/v1/text_to_image`;

    } else {
        // --- Standard OpenAI Structure ---
        requestBody = {
            model: IMAGE_MODEL,
            prompt: fullPrompt,
            n: 1,
            size: "1024x1024"
        };

        // Standard OpenAI endpoint logic
        const baseUrl = IMAGE_BASE_URL.endsWith('/v1') ? IMAGE_BASE_URL : `${IMAGE_BASE_URL}/v1`;
        endpoint = `${baseUrl}/images/generations`;
    }

    console.log(`[Image API] Sending Request to: ${endpoint}`);
    console.log(`[Image API] Payload:`, JSON.stringify(requestBody, null, 2));

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${IMAGE_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
             const errText = await response.text();
             console.error(`[Image API CRITICAL ERROR] Status: ${response.status}`);
             console.error(`[Image API CRITICAL ERROR] Body: ${errText}`);
             throw new Error(`Image API Failed (${response.status}): ${errText}`);
        }
        
        const data = await response.json();
        console.log("[Image API] Success Data:", data); 
        
        // 1. SeaDream/MiniMax specific: outcome.media_urls
        if (data.outcome && data.outcome.media_urls && data.outcome.media_urls.length > 0) {
            return data.outcome.media_urls[0].url;
        }
        
        // 2. Some providers wrap it in 'base_resp'
        if (data.base_resp && data.base_resp.status_msg === 'success' && data.reply) {
             // Try to parse reply if it looks like standard format, otherwise check custom fields
             // (This is rare but some gateways do it)
        }

        // 3. Standard OpenAI: data[0].url
        if (data.data && data.data[0]) {
            if (data.data[0].url) return data.data[0].url;
            if (data.data[0].b64_json) return `data:image/jpeg;base64,${data.data[0].b64_json}`;
            if (data.data[0].image_url) return data.data[0].image_url;
        }
        
        if (data.url) return data.url;
        
        console.error("[Image API Parsing Error] Could not find URL in response keys. Available keys:", Object.keys(data));
        throw new Error("No image data received in response");
    } catch (e) {
        console.error("fetchImageGeneration Exception:", e);
        throw e; 
    }
}

// --- Dictionary & Note Taking ---
export const queryDictionary = async (userInput: string) => {
  const systemPrompt = `You are a helpful dictionary assistant. Output JSON.
  { "identifiedWord": "string", "definition": "string", "example": "string", "translation": "Chinese string" }`;
  
  try {
      const result = await fetchTextCompletion(systemPrompt, `Define: "${userInput}"`, true);
      return parseJSON(result);
  } catch (e: any) {
      throw new Error(e.message || "Failed to fetch definition");
  }
};

// --- Image Generation Public Methods ---

/**
 * 单词卡片生成
 */
export const generateCardImage = async (word: string, context?: string): Promise<string> => {
  try {
    const prompt = `vector icon of ${word}, ${context}, flat design, minimalist, white background, app icon style, high quality, no text`;
    return await fetchImageGeneration(prompt);
  } catch (e) {
    console.error("Card Image Error - Using Fallback:", e);
    return getPlaceholder(word, "#FFA500");
  }
};

/**
 * 宠物生成
 */
export const generatePetSprite = async (stage: number): Promise<string> => {
    let prompt = '';

    if (stage === 0) {
        // Stage 0: 强制静物 - 3D Icon
        prompt = `3D render icon of a mysterious round golden egg, smooth texture, shiny, isometric view, on white background, 3d game asset, no face, no eyes, no limbs, inanimate object`;
    } else {
        // Stage 1+: 毛绒玩具
        let description = "";
        if (stage === 1) description = "cute yellow round monster plushie";
        if (stage === 2) description = "fox plushie toy";
        if (stage === 3) description = "mythical beast figurine";

        prompt = `3D render of ${description}, cute, soft lighting, isometric view, white background, blind box style, no human, animal shape`;
    }

    try {
        return await fetchImageGeneration(prompt);
    } catch (e) {
        console.error("Pet Sprite Error - Using Fallback:", e);
        return getPlaceholder(stage === 0 ? "Egg" : `Pet Lv.${stage}`, "#FFD700");
    }
}

// --- Pet Interaction (Text) ---
export const generatePetReaction = async (
  petState: any, 
  stats: any, 
  trigger: 'greeting' | 'completed_task' | 'evolving' | 'traveling'
) => {
  const systemPrompt = `You are a virtual pet. Output JSON: { "text": "short sentence", "mood": "happy" }`;
  const userPrompt = `Trigger: ${trigger}. React.`;

  try {
    const result = await fetchTextCompletion(systemPrompt, userPrompt, true);
    return parseJSON(result);
  } catch (e) {
    return { text: "I'm happy!", mood: "happy" };
  }
};

/**
 * 旅行明信片生成
 */
export const generatePostcard = async (petName: string): Promise<string> => {
    try {
        const prompt = `beautiful landscape painting, ghibli style, blue sky, green grass, peaceful, anime style scenery, high quality`;
        return await fetchImageGeneration(prompt);
    } catch(e) {
        console.error("Postcard Error - Using Fallback:", e);
        return getPlaceholder("Travel", "#87CEEB");
    }
}
