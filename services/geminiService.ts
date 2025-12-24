
/**
 * 核心配置
 * 文本：OpenAI 兼容格式 (可通过环境变量自定义)
 * 图像：GMI Cloud 推理引擎 (IE) 异步模式
 */
export const CURRENT_CONFIG = {
    textModel: process.env.TEXT_API_MODEL || 'gpt-3.5-turbo',
    // 默认使用代理路径，如果你在环境变量填了完整的 https 地址，也会兼容
    textBaseUrl: (process.env.TEXT_API_BASE_URL || '/api/proxy/text').replace(/\/$/, ''),
    imageModel: process.env.IMAGE_API_MODEL || 'seedream-4-0-250828',
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
 * OpenAI 兼容格式的文本请求包装器
 */
async function callOpenAITextAPI(messages: any[], jsonMode: boolean = true) {
    const apiKey = process.env.TEXT_API_KEY;
    if (!apiKey) throw new Error("TEXT_API_KEY 缺失，请在 Vercel 环境变量中配置");

    // 构造完整请求 URL
    // 如果 textBaseUrl 是相对路径（如 /api/proxy/text），fetch 会自动补全当前域名
    const url = `${CURRENT_CONFIG.textBaseUrl}/v1/chat/completions`;
    
    const payload: any = {
        model: CURRENT_CONFIG.textModel,
        messages: messages,
        temperature: 0.7
    };

    if (jsonMode) {
        // 部分模型需要 system prompt 强调 JSON 才能触发 json_object 模式
        payload.response_format = { type: "json_object" };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`文本模型请求失败 (${response.status}): ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (jsonMode) {
        try {
            // 兼容性处理：有些模型会在 JSON 外面包裹 ```json ... ```
            const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanContent || '{}');
        } catch (e) {
            console.error("JSON 解析失败，原始内容:", content);
            throw new Error("模型未返回合法的 JSON 格式");
        }
    }
    return content;
}

/**
 * GMI Cloud 推理引擎 (IE) 异步图像生成逻辑
 */
async function callSeedreamAsync(prompt: string): Promise<string> {
    const apiKey = process.env.IMAGE_API_KEY;
    const model = CURRENT_CONFIG.imageModel;
    if (!apiKey) throw new Error("IMAGE_API_KEY 缺失");

    const baseUrl = CURRENT_CONFIG.imageBaseUrl;
    
    // 1. 提交任务
    const createUrl = `${baseUrl}/api/v1/ie/requestqueue/apikey/requests?key=${apiKey}`;
    const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            parameters: { aspect_ratio: "1:1" }
        })
    });

    if (!createResponse.ok) {
        throw new Error(`图像生成提交失败: ${createResponse.status}`);
    }

    const taskData = await createResponse.json();
    const requestId = taskData.id || taskData.requestId;
    if (!requestId) throw new Error("未获取到任务 ID");

    // 2. 轮询状态 (最多等待 60 次，约 4 分钟)
    const pollUrl = `${baseUrl}/api/v1/ie/requestqueue/apikey/requests/${requestId}?key=${apiKey}`;
    let attempts = 0;
    while (attempts < 60) {
        await new Promise(r => setTimeout(r, 4000));
        const statusResponse = await fetch(pollUrl);
        if (!statusResponse.ok) continue;

        const status = await statusResponse.json();
        // 兼容 status 或 done 字段
        if (status.status === 'SUCCEEDED' || status.done === true) {
            const result = status.response || status.result;
            const base64 = result?.generatedImages?.[0]?.image?.imageBytes || result?.imageBytes;
            if (base64) return `data:image/png;base64,${base64}`;
        }
        if (status.status === 'FAILED') throw new Error("图像生成在服务器端失败");
        attempts++;
    }
    throw new Error("图像生成超时");
}

/**
 * 词典查询
 */
export const queryDictionary = async (userInput: string) => {
    const messages = [
        { 
            role: "system", 
            content: "You are a professional language tutor. You must respond ONLY with a JSON object. Format: { \"identifiedWord\": \"...\", \"definition\": \"...\", \"translation\": \"(Chinese)\", \"example\": \"...\", \"visualDescription\": \"(Detailed scene description for image generation)\" }" 
        },
        { role: "user", content: `Explain the word: "${userInput}"` }
    ];
    return await callOpenAITextAPI(messages);
};

/**
 * 生成卡片图像
 */
export const generateCardImage = async (word: string, context?: string, visualDescription?: string): Promise<string> => {
    try {
        const prompt = `3D digital art flashcard: ${word}. ${visualDescription || context}. High quality, vibrant, white background.`;
        return await callSeedreamAsync(prompt);
    } catch (e) {
        console.error("卡片图片生成失败:", e);
        return getPlaceholder(word, "#FBBF24");
    }
};

/**
 * 生成宠物形象
 */
export const generatePetSprite = async (stage: number): Promise<string> => {
    const stages = ["mystical egg", "cute hatchling", "adolescent creature", "legendary guardian"];
    const prompt = `A cute ${stages[stage]} character, 3D clay style, full body, solid white background, high resolution.`;
    try {
        return await callSeedreamAsync(prompt);
    } catch (e) {
        return getPlaceholder("Pet", "#FCD34D");
    }
};

/**
 * 宠物反应
 */
export const generatePetReaction = async (petState: any, stats: any, trigger: string) => {
    const messages = [
        { 
            role: "system", 
            content: "Respond as a cute pet in JSON: { \"text\": \"(Quote)\", \"mood\": \"happy|sleepy|excited|proud\" }" 
        },
        { role: "user", content: `The following just happened: ${trigger}. My current stage is ${petState.stage}.` }
    ];
    try {
        return await callOpenAITextAPI(messages);
    } catch (e) {
        return { text: "Yummy knowledge!", mood: "happy" };
    }
};

/**
 * 生成明信片
 */
export const generatePostcard = async (petName: string): Promise<string> => {
    const prompt = `An artistic travel postcard showing ${petName} at a famous global landmark, cinematic lighting, masterpiece.`;
    try {
        return await callSeedreamAsync(prompt);
    } catch (e) {
        return getPlaceholder("Postcard", "#6366F1");
    }
};
