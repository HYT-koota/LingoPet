

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

    const endpoint = `${IMAGE_BASE_URL}/images/generations`; 

    // 修复 Seed：使用 Signed 32-bit Integer Max (2,147,483,647) 以防服务器溢出
    const randomSeed = Math.floor(Math.random() * 2147483647);

    // 将负面约束直接加入 Prompt，因为 API Payload 不支持 negative_prompt 字段
    const fullPrompt = `${prompt} (禁止内容：模糊、低画质、人脸、文字、水印、扭曲、多余的手指、jpeg噪点)`;

    try {
        console.log(`[Image API] Sending request to: ${endpoint} | Model: ${IMAGE_MODEL} | Prompt: ${fullPrompt.substring(0, 50)}...`);

        // --- SeaDream / MiniMax Structure (Strict Adherence to Screenshot) ---
        // 严格遵守文档截图：model, request_id, payload { prompt, size, seed, guidance_scale, add_watermark, response_format }
        // 绝对不要发送 negative_prompt 字段，否则会报 400 错误
        const requestBody = {
            model: IMAGE_MODEL,
            request_id: crypto.randomUUID(),
            payload: {
                prompt: fullPrompt,
                size: "1024x1024", 
                seed: randomSeed,
                guidance_scale: 2.5, // 官方文档默认值
                add_watermark: false,
                response_format: "url"
            }
        };

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
             console.error(`[Image API Error] Status: ${response.status}`, errText);
             if (response.status === 400) {
                 console.warn("API 400 Error. Usually means invalid parameters. Fallback triggered.");
                 // 不要在这里立刻 fallback 递归，直接抛出异常让上层处理显示占位图
                 throw new Error("Image API Parameters Invalid: " + errText);
             }
             throw new Error("Image API Failed: " + errText);
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
        throw e; // Throw to trigger fallback in caller
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
    // 纯中文自然语言提示词
    const prompt = `一张色彩鲜艳、设计简洁的扁平化矢量插画。画面清晰描绘了"${word}"这个概念。${context ? `场景：${context}` : ""}。风格是现代极简主义，类似Duolingo的插画风格。纯色背景。线条锐利。`;
    
    return await fetchImageGeneration(prompt);
  } catch (e) {
    console.warn("Using fallback image due to API error");
    // Fallback: Lorem Picsum (Generic high quality photo) instead of Emoji
    return `https://picsum.photos/seed/${word}/400/300`; 
  }
};

/**
 * 宠物生成
 */
export const generatePetSprite = async (stage: number): Promise<string> => {
    let prompt = '';

    if (stage === 0) {
        // Stage 0: 必须是静物，不能是生物
        prompt = `一张专业的静物产品摄影。主体是一枚光滑的圆形魔法宝石，放置在白色的展示台上。材质是发光的玉石，主要颜色是琥珀黄。这是一个无生命的物体，没有五官，没有手脚，纯粹的球体。3D渲染，C4D，超清，8K分辨率。`;
    } else {
        // Stage 1+: 毛绒玩具
        let description = "";
        if (stage === 1) description = "一只圆形的Q版黄色小毛绒球";
        if (stage === 2) description = "一只可爱的狐狸毛绒公仔";
        if (stage === 3) description = "一只帅气的神兽模型玩具";

        prompt = `一张可爱的3D玩具渲染图。主体是${description}。材质是短毛绒。柔和影棚光。造型圆润。它是玩具公仔，不是生物，没有拟人化的人脸。背景纯净。`;
    }

    try {
        return await fetchImageGeneration(prompt);
    } catch (e) {
        console.warn("Using fallback pet sprite due to API error");
        // Fallback: Using a generic abstract shape instead of a face emoji to avoid confusion
        if (stage === 0) return "https://ui-avatars.com/api/?name=Egg&background=FFD700&color=fff&rounded=true&length=1&font-size=0.5";
        return `https://ui-avatars.com/api/?name=Pet&background=FFA500&color=fff&rounded=true`;
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
        const prompt = `一幅治愈系的风景插画。蓝天白云，清新的街道或自然风光。色彩明亮，宫崎骏风格。没有文字。`;
        
        return await fetchImageGeneration(prompt);
    } catch(e) {
        return `https://picsum.photos/seed/travel-${Date.now()}/600/400`;
    }
}
