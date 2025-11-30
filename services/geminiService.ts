

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

    const endpoint = `${IMAGE_BASE_URL}/images/generations`; // Note: MiniMax might use a different endpoint path, but usually proxies map this.

    // 强力负面提示词：专门防止生成人脸、文字、低质量图
    const negativePrompt = "human, face, person, man, woman, child, boy, girl, eyes, mouth, limbs, hands, legs, text, watermark, signature, blurry, low quality, distorted, ugly, bad anatomy, jpeg artifacts";

    // 随机种子
    const randomSeed = Math.floor(Math.random() * 4294967290);

    try {
        console.log(`[Image API] Sending request to: ${endpoint} | Model: ${IMAGE_MODEL}`);

        // --- SeaDream / MiniMax Specific Structure ---
        // Based on user provided JSON log: 
        // { model: "...", payload: { prompt: "...", size: "...", seed: 123, ... } }
        const requestBody = {
            model: IMAGE_MODEL,
            request_id: crypto.randomUUID(),
            payload: {
                prompt: prompt,
                size: "1024x1024",
                seed: randomSeed,
                guidance_scale: 7.5, // 强力约束，防止AI自由发挥
                add_watermark: false,
                response_format: "url", // 根据截图/JSON，这里用 url
                negative_prompt: negativePrompt
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
             // 如果是格式错误，尝试 fallback 到 OpenAI 标准格式
             if (response.status === 400) {
                 console.warn("Retrying with standard OpenAI format...");
                 return await fetchImageGenerationFallback(prompt);
             }
             throw new Error("Image API Failed: " + errText);
        }
        
        const data = await response.json();
        console.log("[Image API Response]", data);

        // 1. Try SeaDream/MiniMax specific output format: outcome.media_urls
        if (data.outcome && data.outcome.media_urls && data.outcome.media_urls.length > 0) {
            return data.outcome.media_urls[0].url;
        }

        // 2. Try Standard OpenAI format: data[0].url
        if (data.data && data.data[0]) {
            if (data.data[0].url) return data.data[0].url;
            if (data.data[0].b64_json) return `data:image/jpeg;base64,${data.data[0].b64_json}`;
            if (data.data[0].image_url) return data.data[0].image_url;
        }
        
        // 3. Try flat url
        if (data.url) return data.url;
        
        throw new Error("No image data received in response");
    } catch (e) {
        console.warn("Primary Image API failed, attempting fallback...", e);
        // Fallback to placeholder to prevent app crash
        throw e;
    }
}

// Fallback for standard OpenAI providers if the user switches models later
async function fetchImageGenerationFallback(prompt: string): Promise<string> {
    const endpoint = `${IMAGE_BASE_URL}/images/generations`;
    const payload = {
        model: IMAGE_MODEL,
        prompt: prompt,
        n: 1,
        size: "1024x1024"
    };
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${IMAGE_KEY}` },
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    return data.data?.[0]?.url || "";
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
 * 需求：生成能够表达文本意思的卡通图片
 * 策略：扁平矢量风格，强调“示意图”而非“照片”，防止模糊
 */
export const generateCardImage = async (word: string, context?: string): Promise<string> => {
  try {
    // 使用 "App Icon" 和 "UI Asset" 概念，强制模型生成清晰、无背景、高对比度的图
    const prompt = `(App Icon Design), (Vector Art), (Flat Illustration).
    Subject: A simple, clear visual representation of "${word}".
    Context: ${context}.
    Style: Minimalist UI design, solid colors, white background, high definition.
    Constraint: NO text, NO realistic photo, NO blur, NO complex details.
    中文描述：一个极简风格的APP矢量图标。描绘"${word}"。扁平化设计，白色背景，无阴影，线条清晰锐利。`;
    
    return await fetchImageGeneration(prompt);
  } catch (e) {
    console.warn("Using fallback image due to API error");
    return `https://picsum.photos/seed/${word}-${new Date().getDate()}/400/300`; 
  }
};

/**
 * 宠物生成
 * 需求：生成可爱的萌宠形象，在不同进化阶段有不同形态
 * 策略：严格区分“蛋”和“动物”。
 * 关键修复：Stage 0 不再叫 "Egg" (因为AI认为Egg会孵出生命)，改叫 "Gemstone Sphere" (宝石球)。
 */
export const generatePetSprite = async (stage: number): Promise<string> => {
    let prompt = '';

    if (stage === 0) {
        // Stage 0: EGG -> 强制使用“材质球/静物”逻辑
        // 这里的提示词完全去掉了 "Egg" 这个词，改用 Sphere/Gemstone
        prompt = `(3D Product Render), (Still Life Photography), (Material Design).
        Subject: A perfectly round magical gemstone sphere standing on the floor.
        Style: C4D, Octane Render, High Gloss, Emissive glowing patterns.
        Background: Pure white background.
        Constraint: INANIMATE OBJECT, geometric shape, NO face, NO eyes, NO mouth, NO limbs, NO organic features.
        中文描述：一个完美的圆形魔法宝石球。材质像发光的玉石。静物摄影，3D产品渲染。没有生命特征，没有五官，没有手脚。仅仅是一个球体。`;
    } else {
        // Stage 1+: CREATURE
        let description = "";
        if (stage === 1) description = "A round baby blob creature, jelly texture";
        if (stage === 2) description = "A small magical fox-like creature with wings";
        if (stage === 3) description = "A majestic fantasy guardian beast, glowing";

        prompt = `(3D Character Design), (Blind Box Toy Style), (Pixar Style).
        Subject: ${description}.
        Style: Cute, Chibi, Soft lighting, Clay material.
        Background: Pure white background.
        Constraint: Animal/Monster shape, NOT human, cute.
        中文描述：盲盒玩具风格的3D渲染。Q版小动物。皮克斯风格。${stage === 1 ? "果冻质感的小圆球怪" : "魔法小兽"}。不是人类。`;
    }

    try {
        return await fetchImageGeneration(prompt);
    } catch (e) {
        console.warn("Using fallback pet sprite");
        return `https://api.dicebear.com/9.x/adventurer/svg?seed=${stage}-${Date.now()}`;
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
        const prompt = `(Anime Art), (Makoto Shinkai Style), (Scenery).
        Subject: Beautiful travel landscape (Japan, Europe, or Nature).
        Style: High definition, vibrant colors, lens flare, blue sky.
        Details: A tiny silhouette of a small creature in the distance (back view).
        Constraint: NO text, high resolution.
        中文描述：新海诚风格的风景画。高清壁纸。蓝天白云，光影效果好。画面中有一个非常小的宠物背影。`;
        
        return await fetchImageGeneration(prompt);
    } catch(e) {
        return `https://picsum.photos/seed/travel-${Date.now()}/600/400`;
    }
}
