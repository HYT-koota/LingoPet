
/**
 * 核心配置
 * 这里的 process.env 会在构建时由 vite.config.ts 替换为真实的环境变量
 */
export const CURRENT_CONFIG = {
    textModel: process.env.TEXT_API_MODEL || 'model-not-set',
    textBaseUrl: (process.env.TEXT_API_BASE_URL || '/api/proxy/text').replace(/\/$/, ''),
    imageModel: process.env.IMAGE_API_MODEL || 'seedream-4-0-250828',
    imageBaseUrl: (process.env.IMAGE_API_BASE_URL || '/api/proxy/image').replace(/\/$/, ''),
    hasTextKey: !!process.env.TEXT_API_KEY,
    hasImageKey: !!process.env.IMAGE_API_KEY
};

// 启动自检，在控制台打印当前配置（不泄露全量 Key）
console.log("🚀 LingoPet Service Initialized with Config:", {
    textModel: CURRENT_CONFIG.textModel,
    textBaseUrl: CURRENT_CONFIG.textBaseUrl,
    hasTextKey: CURRENT_CONFIG.hasTextKey,
    imageModel: CURRENT_CONFIG.imageModel
});

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
    if (!apiKey) throw new Error("TEXT_API_KEY 未找到，请检查 Vercel 环境变量设置");
    if (CURRENT_CONFIG.textModel === 'model-not-set') throw new Error("TEXT_API_MODEL 未设置，请在环境变量中指定模型名称");

    const url = `${CURRENT_CONFIG.textBaseUrl}/v1/chat/completions`;
    
    const payload: any = {
        model: CURRENT_CONFIG.textModel,
        messages: messages,
        temperature: 0.7
    };

    if (jsonMode) {
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
        throw new Error(`API 报错 [${response.status}]: ${errorText.substring(0, 150)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (jsonMode) {
        try {
            const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanContent || '{}');
        } catch (e) {
            console.error("JSON 解析失败:", content);
            throw new Error("模型未返回合法的 JSON");
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
    
    // 提交
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
        throw new Error(`图片提交失败 (${createResponse.status})`);
    }

    const taskData = await createResponse.json();
    const requestId = taskData.id || taskData.requestId;

    // 轮询
    const pollUrl = `${baseUrl}/api/v1/ie/requestqueue/apikey/requests/${requestId}?key=${apiKey}`;
    let attempts = 0;
    while (attempts < 60) {
        await new Promise(r => setTimeout(r, 4000));
        const statusResponse = await fetch(pollUrl);
        if (!statusResponse.ok) continue;

        const status = await statusResponse.json();
        if (status.status === 'SUCCEEDED' || status.done === true) {
            const result = status.response || status.result;
            const base64 = result?.generatedImages?.[0]?.image?.imageBytes || result?.imageBytes;
            if (base64) return `data:image/png;base64,${base64}`;
        }
        if (status.status === 'FAILED') throw new Error("图片生成服务出错");
        attempts++;
    }
    throw new Error("图片生成超时");
}

export const queryDictionary = async (userInput: string) => {
    const messages = [
        { 
            role: "system", 
            content: "You are a professional language tutor. Return ONLY a JSON object: { \"identifiedWord\": \"...\", \"definition\": \"...\", \"translation\": \"(Chinese)\", \"example\": \"...\", \"visualDescription\": \"(Scene description)\" }" 
        },
        { role: "user", content: `Explain: "${userInput}"` }
    ];
    return await callOpenAITextAPI(messages);
};

export const generateCardImage = async (word: string, context?: string, visualDescription?: string): Promise<string> => {
    try {
        const prompt = `3D digital art: ${word}. ${visualDescription || context}. White background.`;
        return await callSeedreamAsync(prompt);
    } catch (e) {
        return getPlaceholder(word, "#FBBF24");
    }
};

export const generatePetSprite = async (stage: number): Promise<string> => {
    const stages = ["egg", "baby creature", "teen creature", "mighty guardian"];
    const prompt = `Cute 3D ${stages[stage]}, character design, white background.`;
    try {
        return await callSeedreamAsync(prompt);
    } catch (e) {
        return getPlaceholder("Pet", "#FCD34D");
    }
};

export const generatePetReaction = async (petState: any, stats: any, trigger: string) => {
    const messages = [
        { role: "system", content: "Respond as a cute pet in JSON: { \"text\": \"...\", \"mood\": \"happy|sleepy|excited|proud\" }" },
        { role: "user", content: `Event: ${trigger}` }
    ];
    try {
        return await callOpenAITextAPI(messages);
    } catch (e) {
        return { text: "Yum!", mood: "happy" };
    }
};

export const generatePostcard = async (petName: string): Promise<string> => {
    const prompt = `Travel postcard of ${petName}, landmark background, anime style.`;
    try {
        return await callSeedreamAsync(prompt);
    } catch (e) {
        return getPlaceholder("Postcard", "#6366F1");
    }
};
