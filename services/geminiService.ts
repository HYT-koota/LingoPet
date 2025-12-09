

// --- Generic API Service (Split Text & Image) ---

// Helper to clean config values (remove spaces, trailing slashes)
const cleanUrl = (url?: string) => url ? url.trim() : ''; 
const cleanVal = (val?: string) => val ? val.trim() : '';

// 1. Text Configuration (Chat / Definitions)
const TEXT_KEY = cleanVal(process.env.TEXT_API_KEY);
const TEXT_BASE_URL = cleanUrl(process.env.TEXT_API_BASE_URL) || 'https://api.openai.com/v1';
const TEXT_MODEL = cleanVal(process.env.TEXT_API_MODEL) || 'gpt-3.5-turbo';

// 2. Image Configuration (Visuals / Pet Sprites)
const IMAGE_KEY = cleanVal(process.env.IMAGE_API_KEY);
// DIRECT RAW URL: Use exactly what the user provided in Vercel.
// User MUST provide the full URL, e.g. "https://api.gmi-serving.com/v1/images/generations"
const IMAGE_FULL_ENDPOINT = cleanUrl(process.env.IMAGE_API_BASE_URL); 
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
        return JSON.parse(text);
    } catch (e) {
        const match = text.match(/```json([\s\S]*?)```/);
        if (match && match[1]) {
            try { return JSON.parse(match[1]); } catch(err) {}
        }
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
    let baseUrl = TEXT_BASE_URL;
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    
    // If user provided a full chat endpoint, use it. Otherwise append.
    let endpoint = baseUrl;
    if (!endpoint.includes('/chat/completions')) {
        if (!endpoint.endsWith('/v1')) endpoint = `${endpoint}/v1`;
        endpoint = `${endpoint}/chat/completions`;
    }
    // Clean double slashes
    endpoint = endpoint.replace(/([^:]\/)\/+/g, "$1");

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
    if (!IMAGE_FULL_ENDPOINT) throw new Error("Image API Base URL is missing. Please set IMAGE_API_BASE_URL to the FULL endpoint URL.");

    // --- ENDPOINT ---
    // User controls this 100%. No auto-append.
    const endpoint = IMAGE_FULL_ENDPOINT;
    
    const randomSeed = Math.floor(Math.random() * 2147483647);
    const isSeaDream = IMAGE_MODEL.toLowerCase().includes('seedream') || IMAGE_MODEL.toLowerCase().includes('minimax');

    // --- PAYLOAD ---
    // We try to support BOTH Standard OpenAI fields (flat) AND GMI Native fields (nested)
    // because GMI gateways often support parameter pass-through if at the root level.
    const requestBody: any = {
        model: IMAGE_MODEL,
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        response_format: "url",
        // Flattened params (Standard OpenAI-compatible Gateway style)
        seed: randomSeed,
        guidance_scale: 7.5, 
    };

    if (isSeaDream) {
        // Double-send parameters in nested payload just in case the gateway requires it
        requestBody.payload = {
            prompt: prompt,
            size: "1024x1024",
            seed: randomSeed,
            guidance_scale: 7.5
        };
    }

    // --- DEBUGGING: GENERATE CURL ---
    const curlCommand = `curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${IMAGE_KEY.substring(0, 5)}..." \\
  -d '${JSON.stringify(requestBody)}'`;

    console.log(`%c[Image API DEBUG]`, "color: #0ea5e9; font-weight: bold;");
    console.log(`Endpoint: ${endpoint}`);
    console.log(`Full Payload:`, requestBody);
    console.log(`👇 COPY THIS COMMAND TO TERMINAL TO TEST 👇`);
    console.log(curlCommand);

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
             console.error(`[Image API Error] Status: ${response.status}`);
             console.error(`[Image API Error] Response: ${errText}`);
             throw new Error(`API Error (${response.status}): ${errText}`);
        }
        
        const data = await response.json();
        console.log(`[Image API] Success:`, data);
        
        // 1. Standard OpenAI Response
        if (data.data && data.data[0]) {
            if (data.data[0].url) return data.data[0].url;
            if (data.data[0].image_url) return data.data[0].image_url;
        }
        
        // 2. GMI Native / SeaDream Response
        if (data.outcome && data.outcome.media_urls && data.outcome.media_urls.length > 0) {
            return data.outcome.media_urls[0].url;
        }

        throw new Error("No image URL found in response.");

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
    // Explicit Chinese prompt for GMI models
    const prompt = `扁平化矢量插画，极简风格，${word} (语境: ${context})。白色背景，高清晰度，教育用途，无文字。`;
    return await fetchImageGeneration(prompt);
  } catch (e) {
    console.error("Card Image Error:", e);
    return getPlaceholder(word, "#FBBF24");
  }
};

export const generatePetSprite = async (stage: number): Promise<string> => {
    let prompt = '';

    if (stage === 0) {
        // Stage 0: EGG -> Force "Gemstone" to avoid faces
        prompt = `一个金黄色的圆形宝石，静物摄影，特写镜头，放置在白色背景上。材质是半透明的水晶，表面光滑。仅仅是一个球体，没有脸，没有五官，没有手脚，不是角色，不是生物。`;
    } else {
        // Stage 1+: PLUSHIE
        let description = "";
        if (stage === 1) description = "可爱的小鸡毛绒公仔 (cute yellow chick plushie)";
        if (stage === 2) description = "橙色的小狐狸毛绒玩具 (orange fox plushie)";
        if (stage === 3) description = "幻想生物手办 (fantasy creature figurine)";

        prompt = `3D渲染，毛绒玩具质感，${description}。柔和的影棚光，白色背景，无文字。Q版风格，可爱。`;
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
        const prompt = `宫崎骏风格风景画，美丽的旅行风景，蓝天白云，治愈系插画。无文字。`;
        return await fetchImageGeneration(prompt);
    } catch(e) {
        return getPlaceholder("Travel", "#60A5FA");
    }
};
