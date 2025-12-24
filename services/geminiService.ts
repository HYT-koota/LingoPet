
/**
 * 核心配置
 * 文本：GMI Serving (OpenAI 格式)
 * 图像：GMI Cloud (Seedream 4.0 异步格式)
 */
export const CURRENT_CONFIG = {
    textModel: 'gemini-1.5-flash', 
    imageModel: process.env.IMAGE_API_MODEL || 'seedream-4-0-250828',
    // 环境变量优先，若无则默认使用 Vercel 代理路径
    textBaseUrl: (process.env.TEXT_API_BASE_URL || '/api/proxy/text').replace(/\/$/, ''),
    imageBaseUrl: (process.env.IMAGE_API_BASE_URL || '/api/proxy/image').replace(/\/$/, ''),
    hasTextKey: !!process.env.TEXT_API_KEY,
    hasImageKey: !!process.env.IMAGE_API_KEY
};

// 辅助函数：生成占位图
function getPlaceholder(text: string, color: string = "#E5E7EB") {
    const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#F9FAFB"/><rect x="156" y="156" width="200" height="200" rx="40" fill="${color}" opacity="0.2"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="${color}" opacity="0.6">${text}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * 通用请求包装器
 */
async function request(url: string, options: RequestInit) {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error [${response.status}]:`, errorText);
        throw new Error(`API 返回错误 (${response.status}): ${errorText.substring(0, 100)}`);
    }

    if (!contentType || !contentType.includes("application/json")) {
        throw new Error("接口返回格式异常（非 JSON），请确认 API 域名或 Vercel 代理配置是否正确。");
    }

    return await response.json();
}

/**
 * 文本 API 调用 (OpenAI 标准格式)
 */
async function callTextAPI(payload: any) {
    const apiKey = process.env.TEXT_API_KEY;
    if (!apiKey) throw new Error("TEXT_API_KEY 缺失");

    const url = `${CURRENT_CONFIG.textBaseUrl}/v1/chat/completions`;

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

    const baseUrl = CURRENT_CONFIG.imageBaseUrl;
    
    // 1. 创建生成任务
    // 规范路径: /v1/models/{model}:generateImages
    const createUrl = `${baseUrl}/v1/models/${model}:generateImages?key=${apiKey}`;
    
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
    // GMI Cloud 的 operationName 通常已经是 "operations/xxxx" 的格式
    const operationName = operation.name; 
    if (!operationName) {
        throw new Error("任务创建失败，未获得 Operation ID");
    }

    // 轮询路径: /v1/{operationName}
    const pollUrl = `${baseUrl}/v1/${operationName}?key=${apiKey}`;
    
    let attempts = 0;
    const maxAttempts = 30; // 轮询约 2 分钟

    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 4000)); // 每 4 秒轮询一次
        
        const status = await request(pollUrl, { method: 'GET' });
        
        if (status.done) {
            if (status.error) {
                throw new Error(`生成失败: ${status.error.message}`);
            }
            // 提取 Base64 数据
            const generatedImages = status.response?.generatedImages;
            const base64 = generatedImages?.[0]?.image?.imageBytes;
            
            if (!base64) throw new Error("任务完成，但未返回有效的图像数据");
            return `data:image/png;base64,${base64}`;
        }
        
        attempts++;
    }

    throw new Error("图像生成超时，Seedream 模型任务排队时间过长。");
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
        throw new Error("解析文本 JSON 失败");
    }
};

/**
 * 生成卡片图像 (Seedream 4.0 异步)
 */
export const generateCardImage = async (word: string, context?: string, visualDescription?: string): Promise<string> => {
    try {
        const prompt = `Flashcard: ${word}. Scene: ${visualDescription || context}. Digital art, clean background.`;
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
    const stages = ["magical egg", "cute chick", "fox creature", "dragon mascot"];
    const prompt = `Full body character of a ${stages[stage]}, 3D game style, white background.`;
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
        return { text: "Nice work!", mood: "happy" };
    }
};

/**
 * 生成旅行明信片
 */
export const generatePostcard = async (petName: string): Promise<string> => {
    const prompt = `Postcard style: ${petName} is traveling in a beautiful landscape, anime style.`;
    try {
        return await callSeedreamAsync(prompt);
    } catch (e) {
        return getPlaceholder("Postcard", "#6366F1");
    }
};
