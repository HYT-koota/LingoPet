

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

    const endpoint = `${TEXT_BASE_URL}/chat/completions`;

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
    const fullPrompt = `${prompt}, 无文字, 无水印, 高清, high quality`;

    // Detect if we are likely using a Native MiniMax/SeaDream model
    const isNativePayload = IMAGE_MODEL.toLowerCase().includes('seedream') || IMAGE_MODEL.toLowerCase().includes('minimax');

    // 构造请求体
    let requestBody: any;
    
    if (isNativePayload) {
        // --- SeaDream / MiniMax Native Structure ---
        requestBody = {
            model: IMAGE_MODEL,
            request_id: generateUUID(),
            payload: {
                prompt: fullPrompt,
                size: "1024x1024", 
                seed: randomSeed,
                guidance_scale: 2.5, // Fixed per user request
                add_watermark: false,
                response_format: "url"
            }
        };
    } else {
        // --- Standard OpenAI Structure ---
        requestBody = {
            model: IMAGE_MODEL,
            prompt: fullPrompt,
            n: 1,
            size: "1024x1024"
        };
    }

    // Smart Endpoint Selection
    // Ensure no double slashes if base url ends with /
    const baseUrl = IMAGE_BASE_URL.replace(/\/+$/, '');
    
    const primaryEndpoint = isNativePayload 
        ? `${baseUrl}/text_to_image` 
        : `${baseUrl}/images/generations`;

    const fallbackEndpoint = isNativePayload 
        ? `${baseUrl}/images/generations` 
        : `${baseUrl}/text_to_image`;

    const tryFetch = async (url: string) => {
        console.log(`[Image API] Sending Request to: ${url}`);
        console.log(`[Image API] Payload:`, JSON.stringify(requestBody, null, 2)); // DEBUG PAYLOAD

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${IMAGE_KEY}`
            },
            body: JSON.stringify(requestBody)
        });
        return response;
    };

    try {
        let response = await tryFetch(primaryEndpoint);

        // 如果主端点 404，尝试备用端点
        if (response.status === 404) {
             console.warn(`[Image API] Endpoint 404. Switching to fallback: ${fallbackEndpoint}`);
             response = await tryFetch(fallbackEndpoint);
        }

        if (!response.ok) {
             const errText = await response.text();
             console.error(`[Image API CRITICAL ERROR] Status: ${response.status}`);
             console.error(`[Image API CRITICAL ERROR] Body: ${errText}`);
             throw new Error(`Image API Failed (${response.status}): ${errText}`);
        }
        
        const data = await response.json();
        console.log("[Image API] Success Data:", data); // DEBUG RESPONSE
        
        // 1. SeaDream/MiniMax specific: outcome.media_urls
        if (data.outcome && data.outcome.media_urls && data.outcome.media_urls.length > 0) {
            return data.outcome.media_urls[0].url;
        }

        // 2. Standard OpenAI: data[0].url
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
  const systemPrompt = `You are a helpful dictionary assistant for language learners.
  Output strictly valid JSON only. No markdown.
  Structure:
  {
      "identifiedWord": "The core word being asked about (string)",
      "definition": "Simple definition (string)",
      "example": "Short example sentence (string)",
      "translation": "Chinese translation (string)"
  }`;
  
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
    const prompt = `扁平化矢量插图，教科书风格。画面内容：${word}。语境：${context}。背景纯白。构图简单清晰。`;
    return await fetchImageGeneration(prompt);
  } catch (e) {
    console.error("Card Image Error - Using Fallback:", e);
    return `https://placehold.co/600x400/FFA500/FFFFFF/png?text=${encodeURIComponent(word)}`; 
  }
};

/**
 * 宠物生成
 */
export const generatePetSprite = async (stage: number): Promise<string> => {
    let prompt = '';

    if (stage === 0) {
        // Stage 0: 强制静物
        prompt = `3D渲染图，一枚圆形的神秘金蛋，静物摄影，放置在桌子上，高光材质，无五官，无手脚，无生命体特征。`;
    } else {
        // Stage 1+: 毛绒玩具
        let description = "";
        if (stage === 1) description = "一个黄色的Q版毛绒公仔";
        if (stage === 2) description = "一只狐狸造型的毛绒玩偶";
        if (stage === 3) description = "一只神兽造型的手办模型";

        prompt = `3D产品特写，${description}，可爱的玩具，柔和影棚光，纯色背景，无人类特征。`;
    }

    try {
        return await fetchImageGeneration(prompt);
    } catch (e) {
        console.error("Pet Sprite Error - Using Fallback:", e);
        if (stage === 0) return "https://placehold.co/400x400/FFD700/FFFFFF/png?text=Egg";
        return `https://placehold.co/400x400/FFA500/FFFFFF/png?text=Pet+${stage}`;
    }
}

// --- Pet Interaction (Text) ---
export const generatePetReaction = async (
  petState: any, 
  stats: any, 
  trigger: 'greeting' | 'completed_task' | 'evolving' | 'traveling'
) => {
  const systemPrompt = `You are a virtual pet named ${petState.name}.
  Output strictly valid JSON.
  Structure: { "text": "max 15 words cute sentence", "mood": "happy|excited|sleepy|proud" }`;

  const userPrompt = `Current Stage: ${petState.stage}. Trigger Event: ${trigger}. React to the user.`;

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
        const prompt = `宫崎骏风格手绘风景画，蓝天白云，青草地，治愈系，低饱和度，画面清晰。`;
        return await fetchImageGeneration(prompt);
    } catch(e) {
        console.error("Postcard Error - Using Fallback:", e);
        return `https://placehold.co/600x400/87CEEB/FFFFFF/png?text=Travel+Card`;
    }
}

