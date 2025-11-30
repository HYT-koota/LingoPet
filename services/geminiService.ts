

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

    // Only add response_format for models known to support it to avoid 400 errors on custom models
    if (jsonMode && (TEXT_MODEL.toLowerCase().includes('gpt') || TEXT_MODEL.toLowerCase().includes('deepseek'))) {
        body.response_format = { type: "json_object" };
    }

    const endpoint = `${TEXT_BASE_URL}/chat/completions`;

    try {
        console.log(`[Text API] Sending request to: ${endpoint} | Model: ${TEXT_MODEL}`);
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[Text API Error] Status: ${response.status}`, errText);
            
            // Check for common 404 issues
            if (response.status === 404) {
                throw new Error(`API 404 Not Found. Check BASE_URL (${TEXT_BASE_URL}) and MODEL (${TEXT_MODEL}). Provider message: ${errText}`);
            }
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

    // 修复 Seed：使用 Signed 32-bit Integer Max (2,147,483,647)
    const randomSeed = Math.floor(Math.random() * 2147483647);

    // 将负面约束直接加入 Prompt (中文自然语言)
    const fullPrompt = `${prompt} (画面清晰，无模糊，无文字，无水印，无多余手指，无扭曲)`;

    // Detect if we are likely using a Native MiniMax/SeaDream model
    const isNativePayload = IMAGE_MODEL.toLowerCase().includes('seedream') || IMAGE_MODEL.toLowerCase().includes('minimax');

    // 构造请求体
    let requestBody: any;
    
    if (isNativePayload) {
        // --- SeaDream / MiniMax Native Structure ---
        // 严格遵守原生文档: payload 嵌套
        requestBody = {
            model: IMAGE_MODEL,
            request_id: crypto.randomUUID(),
            payload: {
                prompt: fullPrompt,
                size: "1024x1024", 
                seed: randomSeed,
                guidance_scale: 2.5, // 官方推荐值
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
    // 如果是原生 Payload，优先尝试原生路径 /text_to_image
    // 否则默认尝试 OpenAI 路径 /images/generations
    const primaryEndpointSuffix = isNativePayload ? '/text_to_image' : '/images/generations';
    const fallbackEndpointSuffix = isNativePayload ? '/images/generations' : '/text_to_image';

    const tryFetch = async (endpoint: string) => {
        console.log(`[Image API] Attempting: ${endpoint} | Model: ${IMAGE_MODEL}`);
        const response = await fetch(endpoint, {
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
        let response = await tryFetch(`${IMAGE_BASE_URL}${primaryEndpointSuffix}`);

        // 如果主端点 404，尝试备用端点
        if (response.status === 404) {
             console.warn(`[Image API] Primary endpoint 404. Retrying with fallback: ${IMAGE_BASE_URL}${fallbackEndpointSuffix}`);
             response = await tryFetch(`${IMAGE_BASE_URL}${fallbackEndpointSuffix}`);
        }

        if (!response.ok) {
             const errText = await response.text();
             console.error(`[Image API Error] Status: ${response.status}`, errText);
             throw new Error(`Image API Failed (${response.status}): ${errText}`);
        }
        
        const data = await response.json();
        
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
        
        throw new Error("No image data received in response");
    } catch (e) {
        console.warn("Image Generation Failed:", e);
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
    // 纯中文自然语言提示词 (新海诚/吉卜力风格，确保清晰)
    const prompt = `一张插画，风格是清晰的扁平化矢量图。画面内容是"${word}"。${context ? `语境是：${context}` : ""}。背景纯净，线条简单明快，色彩鲜艳，类似于教科书插图。不要模糊，不要写实照片。`;
    
    return await fetchImageGeneration(prompt);
  } catch (e) {
    console.warn("Using fallback image due to API error");
    // Fallback: Generic pattern to indicate error but look clean
    return `https://placehold.co/600x400/FFA500/FFFFFF/png?text=${word}`; 
  }
};

/**
 * 宠物生成
 */
export const generatePetSprite = async (stage: number): Promise<string> => {
    let prompt = '';

    if (stage === 0) {
        // Stage 0: 必须是静物 (Sphere/Gemstone)
        prompt = `一张静物特写。主体是一个圆形的金色魔法球，或者发光的宝石蛋。它是一个物体，放在桌子上。表面光滑，有魔法光泽。没有眼睛，没有嘴巴，没有手脚。3D渲染，C4D风格。`;
    } else {
        // Stage 1+: 毛绒公仔 (Plushie) 防止拟人化
        let description = "";
        if (stage === 1) description = "一个黄色的圆形毛绒小公仔";
        if (stage === 2) description = "一只可爱的狐狸毛绒玩偶";
        if (stage === 3) description = "一只帅气的神兽模型";

        prompt = `一张可爱的3D产品渲染图。主体是${description}。材质是柔软的毛绒。它是一个玩具公仔。背景是纯白色的。灯光柔和。没有人类特征。`;
    }

    try {
        return await fetchImageGeneration(prompt);
    } catch (e) {
        console.warn("Using fallback pet sprite due to API error");
        // Fallback: Abstract colorful circle
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
        const prompt = `一幅风景画。治愈系动漫风格，宫崎骏风格。蓝天白云，草地，或者宁静的街道。画面清晰，色彩清新。`;
        
        return await fetchImageGeneration(prompt);
    } catch(e) {
        return `https://placehold.co/600x400/87CEEB/FFFFFF/png?text=Travel+Card`;
    }
}
