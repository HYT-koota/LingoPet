

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
const IMAGE_BASE_URL = cleanUrl(process.env.IMAGE_API_BASE_URL) || 'https://api.gmi-serving.com/v1';
const IMAGE_MODEL = cleanVal(process.env.IMAGE_API_MODEL) || 'seedream-3-0-t2i-250415';

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

// --- Helper: Create Clean SVG Placeholder ---
function getPlaceholder(text: string, color: string = "#E5E7EB") {
    const svg = `
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <rect width="512" height="512" fill="#F9FAFB"/>
        <rect x="156" y="156" width="200" height="200" rx="40" fill="${color}" opacity="0.2"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="${color}" opacity="0.6">${text}</text>
        <path d="M256 200 L256 312 M200 256 L312 256" stroke="${color}" stroke-width="20" stroke-linecap="round" opacity="0.4"/>
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
    const baseUrl = TEXT_BASE_URL.endsWith('/v1') ? TEXT_BASE_URL : `${TEXT_BASE_URL}/v1`;
    const endpoint = `${baseUrl}/chat/completions`.replace(/([^:]\/)\/+/g, "$1");

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

    // --- SMART ROUTING LOGIC ---
    let endpoint = IMAGE_BASE_URL;
    const isSeaDream = IMAGE_MODEL.toLowerCase().includes('seedream') || IMAGE_MODEL.toLowerCase().includes('minimax');
    
    // Determine Endpoint based on Model Type
    if (isSeaDream) {
        // STRATEGY: Native GMI/MiniMax Endpoint (/text_to_image)
        // We strip '/images/generations' or '/v1' from the env var to get the raw host, then append correct path
        
        let base = endpoint;
        // Strip common suffixes to find the root/v1 base
        base = base.replace(/\/images\/generations\/?$/, '');
        base = base.replace(/\/v1\/?$/, ''); 
        
        // Reconstruct Native Endpoint
        endpoint = `${base}/v1/text_to_image`;
    } else {
        // STRATEGY: Standard OpenAI Endpoint (/images/generations)
        if (!endpoint.endsWith('generations')) {
             const base = endpoint.endsWith('/v1') ? endpoint : `${endpoint}/v1`;
             endpoint = `${base}/images/generations`;
        }
    }
    
    // Clean double slashes (but keep http://)
    endpoint = endpoint.replace(/([^:]\/)\/+/g, "$1");

    // Safe 32-bit Integer for Seed
    const randomSeed = Math.floor(Math.random() * 2147483647);

    // --- PAYLOAD CONSTRUCTION ---
    let requestBody: any = {};

    if (isSeaDream) {
        // NATIVE STRUCTURE: { model, payload: { ... } }
        requestBody = {
            model: IMAGE_MODEL,
            payload: {
                prompt: prompt,
                size: "1024x1024",
                response_format: "url",
                seed: randomSeed,
                guidance_scale: 5.0, 
                // Negative prompt is crucial for SeaDream to avoid faces, but handled inside prompt text if API doesn't support param
                // We add it here just in case the gateway supports it
                negative_prompt: "human, face, person, man, woman, child, text, watermark, bad quality, blurry, distorted"
            }
        };
    } else {
        // OPENAI STANDARD STRUCTURE
        requestBody = {
            model: IMAGE_MODEL,
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            response_format: "url",
        };
    }

    console.log(`[Image API] Endpoint: ${endpoint}`);
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
             throw new Error(`Image API Failed (${response.status}): ${errText.substring(0, 100)}`);
        }
        
        const data = await response.json();
        
        // 1. Standard OpenAI Response
        if (data.data && data.data[0]) {
            if (data.data[0].url) return data.data[0].url;
            if (data.data[0].image_url) return data.data[0].image_url;
        }
        
        // 2. GMI Native / SeaDream Response
        if (data.outcome && data.outcome.media_urls && data.outcome.media_urls.length > 0) {
            return data.outcome.media_urls[0].url;
        }

        console.error("[Image API] Response format unrecognized:", data);
        throw new Error("No image URL found in response");

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

export const generateCardImage = async (word: string, context?: string): Promise<string> => {
  try {
    // 强制“吉卜力/新海诚”风格，保证清晰好看
    const prompt = `吉卜力手绘风格插画，清新的色彩，${word} (${context})。画面清晰，极简主义，宫崎骏动画背景，高分辨率，无文字。`;
    return await fetchImageGeneration(prompt);
  } catch (e) {
    console.error("Card Image Error:", e);
    return getPlaceholder(word, "#FBBF24");
  }
};

export const generatePetSprite = async (stage: number): Promise<string> => {
    let prompt = '';

    if (stage === 0) {
        // Stage 0: EGG -> FORCE GEOMETRIC OBJECT
        // Using "Sphere" (圆球) instead of Egg to prevent face generation.
        // Adding "Gemstone" (宝石) and "Glass" (玻璃) to enforce object material.
        prompt = `一个晶莹剔透的黄色水晶球 (Yellow Crystal Sphere)，置于纯白背景上。3D渲染，C4D风格，玻璃材质，光滑，反光。特写镜头，极简主义。绝非生物，没有五官，没有手脚，纯粹的静物摄影。`;
    } else {
        // Stage 1+: PLUSHIE / TOY
        let description = "";
        if (stage === 1) description = "黄色小鸡形状的毛绒公仔 (Plushie toy)";
        if (stage === 2) description = "橙色小狐狸形状的软胶玩具 (Vinyl toy)";
        if (stage === 3) description = "传说中的神秘生物精致手办 (Figurine)";

        prompt = `3D渲染盲盒风格，${description}，纯色背景，柔和影棚光，可爱，高品质材质，无水印。`;
    }

    try {
        return await fetchImageGeneration(prompt);
    } catch (e) {
        console.error("Pet Sprite Error:", e);
        return getPlaceholder("Pet", "#FCD34D");
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

export const generatePostcard = async (petName: string): Promise<string> => {
    try {
        const prompt = `宫崎骏风格手绘风景画，旅行明信片，蓝天白云草地，清新自然，治愈系，高分辨率，无文字。`;
        return await fetchImageGeneration(prompt);
    } catch(e) {
        return getPlaceholder("Travel", "#60A5FA");
    }
};
