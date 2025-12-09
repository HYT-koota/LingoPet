
// --- Generic API Service (Split Text & Image) ---

// Helper to clean config values (remove spaces, trailing slashes)
const cleanUrl = (url?: string) => url ? url.trim() : ''; 
const cleanVal = (val?: string) => val ? val.trim() : '';

// 1. Text Configuration (Chat / Definitions)
const TEXT_KEY = cleanVal(process.env.TEXT_API_KEY);
let TEXT_BASE_URL = cleanUrl(process.env.TEXT_API_BASE_URL) || 'https://api.openai.com/v1';

// AUTO-FIX: User commonly mistakes Console URL for API URL
if (TEXT_BASE_URL.includes('console.gmicloud.ai')) {
    console.warn("⚠️ Detected Console URL in TEXT_API_BASE_URL. Auto-correcting to API URL.");
    TEXT_BASE_URL = 'https://api.gmicloud.ai/v1';
}

const TEXT_MODEL = cleanVal(process.env.TEXT_API_MODEL) || 'gpt-3.5-turbo';

// 2. Image Configuration (Visuals / Pet Sprites)
const IMAGE_KEY = cleanVal(process.env.IMAGE_API_KEY);
// DIRECT RAW URL: Use exactly what the user provided in Vercel.
const IMAGE_FULL_ENDPOINT = cleanUrl(process.env.IMAGE_API_BASE_URL); 
const IMAGE_MODEL = cleanVal(process.env.IMAGE_API_MODEL) || 'Kwai-Kolors/Kolors';

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

    // Determine Endpoint
    let endpoint = TEXT_BASE_URL;
    if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
    
    // Auto-append chat/completions if missing and it looks like a base URL
    if (!endpoint.includes('/chat/completions')) {
        if (!endpoint.endsWith('/v1')) endpoint = `${endpoint}/v1`;
        endpoint = `${endpoint}/chat/completions`;
    }
    endpoint = endpoint.replace(/([^:]\/)\/+/g, "$1");

    // PROXY STRATEGY: Try direct first. If CORS fails, try local proxy.
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Text API Error ${response.status}: ${errText}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    } catch (e: any) {
        console.warn("Direct Text API failed, trying Proxy...", e.message);
        
        // Fallback: Try Vercel Proxy (fixes CORS)
        // We construct a local proxy URL: /api/proxy/text/chat/completions
        try {
            const proxyUrl = `/api/proxy/text/chat/completions`; 
            const proxyResponse = await fetch(proxyUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            
            if (!proxyResponse.ok) {
                 const errText = await proxyResponse.text();
                 throw new Error(`Proxy Text API Error ${proxyResponse.status}: ${errText}`);
            }
            const data = await proxyResponse.json();
            return data.choices?.[0]?.message?.content || "";
        } catch (proxyError: any) {
             console.error("Both Direct and Proxy Text API failed.", proxyError);
             throw new Error(`Connection Failed. Please check TEXT_API_BASE_URL. (Tried: ${endpoint})`);
        }
    }
}

// --- IMAGE API CALLS ---
async function fetchImageGeneration(prompt: string): Promise<string> {
    if (!IMAGE_KEY) throw new Error("Image API Key is missing");
    
    // Default to SiliconFlow proxy if no URL provided, otherwise use user URL
    let endpoint = IMAGE_FULL_ENDPOINT || '/api/proxy/image/images/generations';
    
    // --- PAYLOAD ---
    // Standard OpenAI Format (Works for SiliconFlow / Kolors)
    const requestBody: any = {
        model: IMAGE_MODEL,
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        response_format: "url", 
        seed: Math.floor(Math.random() * 99999999),
    };

    console.log(`[Image API] Sending to: ${endpoint}`);

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
             console.error(`[Image API Error] Status: ${response.status} Body: ${errText}`);
             // If direct call fails due to CORS/404, try the proxy if user hasn't hardcoded a proxy yet
             if (!endpoint.includes('/api/proxy') && (response.status === 0 || response.status === 404)) {
                 console.log("Attempting fallback to /api/proxy/image...");
                 return fetchImageGenerationViaProxy(prompt, requestBody);
             }
             throw new Error(`API Error (${response.status}): ${errText}`);
        }
        
        const data = await response.json();
        
        // 1. Standard OpenAI Response (SiliconFlow usually returns data[0].url)
        if (data.data && data.data[0]) {
            if (data.data[0].url) return data.data[0].url;
            if (data.data[0].image_url) return data.data[0].image_url;
        }
        
        throw new Error("No image URL found in response.");

    } catch (e) {
        console.error("fetchImageGeneration Exception:", e);
        // Last ditch effort: Try proxy if the first fail wasn't already the proxy
        if (!endpoint.includes('/api/proxy')) {
             return fetchImageGenerationViaProxy(prompt, requestBody);
        }
        throw e; 
    }
}

// Fallback function for images
async function fetchImageGenerationViaProxy(prompt: string, body: any): Promise<string> {
    const proxyEndpoint = '/api/proxy/image/images/generations';
    try {
        const response = await fetch(proxyEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${IMAGE_KEY}`
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error("Proxy failed");
        const data = await response.json();
        return data.data?.[0]?.url || "";
    } catch(e) {
        throw new Error("Failed to generate image via both Direct and Proxy methods.");
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
    // Flashcard style: Cute, clean, educational
    const prompt = `(SiliconFlow Kolors) 极简风格插画，卡通风格，${word} (语境: ${context})。色彩明快，矢量图风格，白色背景，无文字，教育卡片。`;
    return await fetchImageGeneration(prompt);
  } catch (e) {
    console.error("Card Image Error:", e);
    return getPlaceholder(word, "#FBBF24");
  }
};

export const generatePetSprite = async (stage: number): Promise<string> => {
    let prompt = '';

    if (stage === 0) {
        // Stage 0: EGG - Cute Cartoon Style
        prompt = `(SiliconFlow Kolors) 一颗可爱的神奇宠物蛋，卡通风格，蛋壳上有发光的金色星星花纹。柔和的暖光，吉卜力动画风格，治愈系插画，3D渲染，圆润可爱，白色背景，无文字。`;
    } else {
        // Stage 1+: Cute Character
        let description = "";
        if (stage === 1) description = "一只超级可爱的Q版小鸡，圆滚滚的身体 (cute round chick)";
        if (stage === 2) description = "一只淘气的Q版橙色小狐狸，大大的眼睛 (cute orange fox chibi)";
        if (stage === 3) description = "一只华丽的梦幻生物，发光的翅膀 (fantasy creature with glowing wings)";

        // Style: Pop Mart / Disney / Pixar style
        prompt = `(SiliconFlow Kolors) 3D盲盒潮玩风格，${description}。皮克斯动画风格，精致的色彩，柔和的影棚光，白色背景，无文字，正面特写，超级可爱。`;
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
        const prompt = `(SiliconFlow Kolors) 新海诚风格风景画，美丽的旅行风景，蓝天白云，动漫风格，色彩鲜艳，治愈系。无文字。`;
        return await fetchImageGeneration(prompt);
    } catch(e) {
        return getPlaceholder("Travel", "#60A5FA");
    }
};
