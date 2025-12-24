
/**
 * 核心配置
 * 文本：GMI Serving (OpenAI 格式)
 * 图像：GMI Cloud (Seedream 4.0 异步格式)
 */
export const CURRENT_CONFIG = {
    textModel: 'gemini-1.5-flash', 
    imageModel: process.env.IMAGE_API_MODEL || 'seedream-4-0-250828',
    hasTextKey: !!process.env.TEXT_API_KEY,
    hasImageKey: !!process.env.IMAGE_API_KEY
};

// 辅助函数：生成占位图
function getPlaceholder(text: string, color: string = "#E5E7EB") {
    const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#F9FAFB"/><rect x="156" y="156" width="200" height="200" rx="40" fill="${color}" opacity="0.2"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="${color}" opacity="0.6">${text}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * 通用请求包装器，防止 404/502 导致的解析错误
 */
async function request(url: string, options: RequestInit) {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error [${response.status}]:`, errorText);
        throw new Error(`请求失败: ${response.status} ${errorText.substring(0, 50)}`);
    }

    if (!contentType || !contentType.includes("application/json")) {
        throw new Error("接口返回了非 JSON 内容，请检查代理配置或 API 路径。");
    }

    return await response.json();
}

/**
 * 文本 API 调用 (OpenAI 标准格式)
 */
async function callTextAPI(payload: any) {
    const apiKey = process.env.TEXT_API_KEY;
    // 使用 OpenAI 标准路径
    const url = `/api/proxy/text/v1/chat/completions`;

    if (!apiKey) throw new Error("TEXT_API_KEY 缺失");

    const data = await request(url, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}` 
        },
        body: JSON.stringify(payload)
    });

    return data.choices?.[0]?.message?.content;
}

/**
 * Seedream 4.0 图像异步生成逻辑
 */
async function callSeedreamAsync(prompt: string): Promise<string> {
    const apiKey = process.env.IMAGE_API_KEY;
    const model = CURRENT_CONFIG.imageModel;
    if (!apiKey) throw new Error("IMAGE_API_KEY 缺失");

    // 1. 创建生成任务
    // 路径遵循 GMI Cloud 异步标准: /v1/models/{model}:generateImages
    const createUrl = `/api/proxy/image/v1/models/${model}:generateImages?key=${apiKey}`;
    
    // Seedream 4.0 特定参数结构
    const createPayload = {
        prompt: prompt,
        aspect_ratio: "1:1",
        safety_setting: "BLOCK_MEDIUM_AND_ABOVE"
    };

    const operation = await request(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload)
    });

    // 2. 获取 Operation Name 并开始轮询
    const operationName = operation.name;
    if (!operationName) {
        throw new Error("未获取到任务 ID (Operation Name)");
    }

    const pollUrl = `/api/proxy/image/v1/${operationName}?key=${apiKey}`;
    let attempts = 0;
    const maxAttempts = 20; // 约 60-100 秒超时

    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 4000)); // 每 4 秒检查一次
        
        const status = await request(pollUrl, { method: 'GET' });
        
        if (status.done) {
            if (status.error) {
                throw new Error(`生成失败: ${status.error.message}`);
            }
            // 提取结果中的图像 Base64
            const generatedImages = status.response?.generatedImages;
            const base64 = generatedImages?.[0]?.image?.imageBytes;
            
            if (!base64) throw new Error("任务完成但未找到图像数据");
            return `data:image/png;base64,${base64}`;
        }
        
        attempts++;
    }

    throw new Error("图像生成超时，请稍后在笔记本中查看");
}

/**
 * 词典查询
 */
export const queryDictionary = async (userInput: string) => {
    const payload = {
        model: CURRENT_CONFIG.textModel,
        messages: [
            { role: "system", content: "You are a professional dictionary. Return JSON only: { \"identifiedWord\": \"...\", \"definition\": \"...\", \"example\": \"...\", \"translation\": \"(Chinese)\", \"visualDescription\": \"(English scene for AI drawing)\" }" },
            { role: "user", content: `Explain the word: "${userInput}"` }
        ],
        response_format: { type: "json_object" }
    };

    const text = await callTextAPI(payload);
    try {
        return JSON.parse(text || '{}');
    } catch (e) {
        throw new Error("无法解析返回的 JSON 数据");
    }
};

/**
 * 生成卡片图像 (Seedream 4.0 异步)
 */
export const generateCardImage = async (word: string, context?: string, visualDescription?: string): Promise<string> => {
    try {
        const prompt = `Educational flashcard for "${word}". Visual: ${visualDescription || context}. Minimalist style, white background.`;
        return await callSeedreamAsync(prompt);
    } catch (e) {
        console.error("Seedream Error:", e);
        return getPlaceholder(word, "#FBBF24");
    }
};

/**
 * 生成宠物形象
 */
export const generatePetSprite = async (stage: number): Promise<string> => {
    const stages = ["magical glowing egg", "cute yellow chick", "orange fox", "celestial dragon"];
    const prompt = `A single 3D character of a ${stages[stage]}, white background, Pixar style, high quality.`;
    try {
        return await callSeedreamAsync(prompt);
    } catch (e) {
        return getPlaceholder("Pet", "#FCD34D");
    }
};

/**
 * 宠物反应 (OpenAI 格式)
 */
export const generatePetReaction = async (petState: any, stats: any, trigger: string) => {
    const payload = {
        model: CURRENT_CONFIG.textModel,
        messages: [
            { role: "system", content: "Short cute pet reaction. Return JSON: { \"text\": \"...\", \"mood\": \"...\" }" },
            { role: "user", content: `Trigger: ${trigger}, State: ${petState.mood}` }
        ],
        response_format: { type: "json_object" }
    };
    
    try {
        const text = await callTextAPI(payload);
        return JSON.parse(text || '{"text": "Yey!", "mood": "happy"}');
    } catch (e) {
        return { text: "Keep it up!", mood: "happy" };
    }
};

/**
 * 生成旅行明信片
 */
export const generatePostcard = async (petName: string): Promise<string> => {
    const prompt = `Artistic travel postcard from a fantasy land, pet ${petName} exploring, vibrant colors, anime background.`;
    try {
        return await callSeedreamAsync(prompt);
    } catch (e) {
        return getPlaceholder("Postcard", "#6366F1");
    }
};
