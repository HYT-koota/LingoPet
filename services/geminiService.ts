

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

    const isSeaDream = IMAGE_MODEL.toLowerCase().includes('seedream') || IMAGE_MODEL.toLowerCase().includes('minimax');
    
    // --- ENDPOINT CONSTRUCTION ---
    // We trust the environment variable. If the user put a full path, we use it.
    // Otherwise, we append standard OpenAI suffix "/images/generations".
    let endpoint = IMAGE_BASE_URL;
    
    // Simple heuristic: If it doesn't end in typical generation paths, append default OpenAI path
    if (!endpoint.endsWith('generations') && !endpoint.endsWith('text_to_image')) {
         const base = endpoint.endsWith('/v1') ? endpoint : `${endpoint}/v1`;
         endpoint = `${base}/images/generations`;
    }
    
    // Clean double slashes (but keep http://)
    endpoint = endpoint.replace(/([^:]\/)\/+/g, "$1");

    // Safe 32-bit Integer for Seed
    const randomSeed = Math.floor(Math.random() * 2147483647);

    // --- PAYLOAD CONSTRUCTION ---
    let requestBody: any = {};

    if (isSeaDream) {
        // NATIVE STRUCTURE: { model, payload: { ... } }
        // We use this structure because SeaDream/MiniMax requires nested params for seed/guidance
        // We assume the gateway at 'endpoint' can handle this JSON structure.
        requestBody = {
            model: IMAGE_MODEL,
            payload: {
                prompt: prompt,
                size: "1024x1024",
                response_format: "url",
                seed: randomSeed,
                guidance_scale: 7.5, // Increased from 5.0 to force adherence (no faces)
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
        
        // 2. GMI Native / SeaDream Response (Outcome format)
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
    // 复习卡片：强调扁平插画，避免糊图
    const prompt = `扁平化矢量插画，极简风格，${word} (${context})。纯色背景，线条清晰，高饱和度，教育插图，无文字，无模糊。`;
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
        // Using "Crystal Ball" and "Gemstone" to avoid biological "Egg"
        prompt = `一个精致的黄色水晶球 (Yellow Crystal Sphere)，放置在纯白背景上。高品质产品摄影，微距镜头，玻璃材质，反光清晰。它是一个静物，没有生命，没有脸，没有五官，绝对不是角色。`;
    } else {
        // Stage 1+: PLUSHIE
        let description = "";
        if (stage === 1) description = "黄色小鸡毛绒公仔 (Yellow Chick Plushie)";
        if (stage === 2) description = "橙色小狐狸毛绒玩具 (Fox Plushie)";
        if (stage === 3) description = "神秘生物精致手办 (Fantasy Figurine)";

        prompt = `3D渲染盲盒风格，${description}，纯白背景，柔和影棚光，毛绒质感，可爱，无水印，无文字。`;
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
