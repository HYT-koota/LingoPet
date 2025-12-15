


import { CURRENT_CONFIG as CONFIG_DEBUG } from './geminiService';

// --- Generic API Service (Split Text & Image) ---

// Helper to clean config values (remove spaces, trailing slashes)
const cleanUrl = (url?: string) => url ? url.trim() : ''; 
const cleanVal = (val?: string) => val ? val.trim() : '';

// 1. Text Configuration (Chat / Definitions)
const TEXT_KEY = cleanVal(process.env.TEXT_API_KEY);
let TEXT_BASE_URL = cleanUrl(process.env.TEXT_API_BASE_URL) || 'https://api.openai.com/v1';

// [REMOVED] Auto-correction logic. 
// The code now strictly uses whatever URL the user provided in Vercel.

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
    userJsonMode: boolean = false
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

    if (userJsonMode && (TEXT_MODEL.toLowerCase().includes('gpt') || TEXT_MODEL.toLowerCase().includes('deepseek'))) {
        body.response_format = { type: "json_object" };
    }

    // Determine Endpoint
    let endpoint = TEXT_BASE_URL;
    
    // Only perform standard cleanups if it doesn't look like a full endpoint
    // If user provided a specific full URL (containing 'chat/completions'), we trust it completely.
    if (!endpoint.includes('/chat/completions')) {
        if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
        if (!endpoint.endsWith('/v1')) endpoint = `${endpoint}/v1`;
        endpoint = `${endpoint}/chat/completions`;
        // Clean up double slashes
        endpoint = endpoint.replace(/([^:]\/)\/+/g, "$1");
    }

    console.log(`[Text API] Endpoint: ${endpoint}`);

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
             throw new Error(`Connection Failed. Please check TEXT_API_BASE_URL.\n(Tried: ${endpoint})\nError: ${e.message}`);
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
  // Enhanced prompt to ask for a "visualDescription" which is a concrete scene for image gen.
  const systemPrompt = `You are a helpful dictionary assistant. Output JSON.
  { 
    "identifiedWord": "string (the exact word)", 
    "definition": "string (short definition)", 
    "example": "string (short example sentence)", 
    "translation": "Chinese string (word meaning)",
    "visualDescription": "string (A concrete, simple visual description of a scene representing this word in its context. Do not use abstract concepts. E.g. for 'Attention', say 'A student raising hand in class'. For 'Bank', say 'A river bank with grass'. In English.)"
  }`;
  
  try {
      const result = await fetchTextCompletion(systemPrompt, `Define: "${userInput}"`, true);
      return parseJSON(result);
  } catch (e: any) {
      throw new Error(e.message || "Failed to fetch definition");
  }
};

// --- Image Generation Public Methods ---

export const generateCardImage = async (word: string, context?: string, visualDescription?: string): Promise<string> => {
  try {
    // Priority: Use the concrete visual description if available (Visual Translation)
    // If not, fall back to word + context.
    const subject = visualDescription ? visualDescription : `${word} (context: ${context})`;
    
    // Flashcard style: Cute, clean, educational
    const prompt = `(SiliconFlow Kolors) Minimalist illustration, flat vector style, white background, no text, cute style. SUBJECT: ${subject}. Bright colors.`;
    
    return await fetchImageGeneration(prompt);
  } catch (e) {
    console.error("Card Image Error:", e);
    return getPlaceholder(word, "#FBBF24");
  }
};

export const generatePetSprite = async (stage: number): Promise<string> => {
    let prompt = '';
    // Key change: Emphasize "Pure White Background" for mix-blend-mode hack
    const styleSuffix = ", pure white background (hex code #FFFFFF), no shadow, flat studio lighting, isolated on white, 3d render, cute";

    if (stage === 0) {
        // Stage 0: EGG - Cute Cartoon Style
        prompt = `(SiliconFlow Kolors) A cute magical pet egg, eggshell has glowing golden star patterns, Ghibli style, healing illustration${styleSuffix}`;
    } else {
        // Stage 1+: Cute Character
        let description = "";
        if (stage === 1) description = "cute round yellow chick, chibi style";
        if (stage === 2) description = "mischievous cute orange fox chibi, big eyes";
        if (stage === 3) description = "majestic fantasy creature, glowing wings, elegant";

        // Style: Pop Mart / Disney / Pixar style
        prompt = `(SiliconFlow Kolors) 3D blind box toy style, ${description}, Pixar style, exquisite detail, front view${styleSuffix}`;
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
        const prompt = `(SiliconFlow Kolors) Shinkai Makoto style landscape, beautiful travel scenery, blue sky and white clouds, anime style, vivid colors, healing, no text.`;
        return await fetchImageGeneration(prompt);
    } catch(e) {
        return getPlaceholder("Travel", "#60A5FA");
    }
};
