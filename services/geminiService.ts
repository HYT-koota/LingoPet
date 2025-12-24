
/**
 * 核心配置诊断
 */
const getEnv = (key: string, fallback: string = "") => {
    const val = (process.env as any)[key];
    return val && val !== "undefined" ? val : fallback;
};

export const CURRENT_CONFIG = {
    // 默认值设为空，这样如果没配置，我们会直接看到报错，而不是看到错误的默认模型
    textModel: getEnv('TEXT_API_MODEL', 'MODEL_NOT_CONFIGURED'),
    textBaseUrl: getEnv('TEXT_API_BASE_URL', '/api/proxy/text').replace(/\/$/, ''),
    imageModel: getEnv('IMAGE_API_MODEL', 'seedream-4-0-250828'),
    imageBaseUrl: getEnv('IMAGE_API_BASE_URL', '/api/proxy/image').replace(/\/$/, ''),
    hasTextKey: !!getEnv('TEXT_API_KEY'),
    hasImageKey: !!getEnv('IMAGE_API_KEY')
};

// 【重要】在浏览器控制台打印配置信息，请刷新页面查看
console.log("%c LingoPet 启动诊断 %c", "background:#FFAE0A;color:white;padding:2px 5px;border-radius:3px", "");
console.log("-> 文本模型 (TEXT_API_MODEL):", CURRENT_CONFIG.textModel);
console.log("-> 文本地址 (TEXT_API_BASE_URL):", CURRENT_CONFIG.textBaseUrl);
console.log("-> 文本密钥状态:", CURRENT_CONFIG.hasTextKey ? "✅ 已设置" : "❌ 未设置");
console.log("-> 图像模型 (IMAGE_API_MODEL):", CURRENT_CONFIG.imageModel);

/**
 * 辅助：生成占位图
 */
function getPlaceholder(text: string, color: string = "#E5E7EB") {
    const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#F9FAFB"/><rect x="156" y="156" width="200" height="200" rx="40" fill="${color}" opacity="0.2"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20" fill="${color}">${text}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * OpenAI 兼容格式文本请求
 */
async function callOpenAITextAPI(messages: any[], jsonMode: boolean = true) {
    const apiKey = (process.env as any).TEXT_API_KEY;
    
    if (!apiKey) throw new Error("缺少 TEXT_API_KEY，请检查 Vercel 环境变量");
    if (CURRENT_CONFIG.textModel === 'MODEL_NOT_CONFIGURED') throw new Error("缺少 TEXT_API_MODEL，请在环境变量中设置模型名称");

    const url = `${CURRENT_CONFIG.textBaseUrl}/v1/chat/completions`;
    
    const payload: any = {
        model: CURRENT_CONFIG.textModel,
        messages: messages,
        temperature: 0.7
    };

    // MiniMax 或某些模型可能不支持 response_format，如果报错 400，可尝试关闭此项
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
        const errorBody = await response.text();
        throw new Error(`[${response.status}] 请求失败。地址: ${url} 模型: ${CURRENT_CONFIG.textModel}。 错误详情: ${errorBody.substring(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (jsonMode) {
        try {
            // 清理模型可能返回的 Markdown 标记
            const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanContent);
        } catch (e) {
            console.warn("JSON解析失败，尝试直接返回内容:", content);
            throw new Error("模型未返回合法的 JSON 格式");
        }
    }
    return content;
}

/**
 * GMI Cloud Seedream 异步生成
 */
async function callSeedreamAsync(prompt: string): Promise<string> {
    const apiKey = (process.env as any).IMAGE_API_KEY;
    if (!apiKey) throw new Error("缺少 IMAGE_API_KEY");

    const baseUrl = CURRENT_CONFIG.imageBaseUrl;
    
    // 1. 提交任务
    const createUrl = `${baseUrl}/api/v1/ie/requestqueue/apikey/requests?key=${apiKey}`;
    const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: CURRENT_CONFIG.imageModel,
            prompt: prompt,
            parameters: { aspect_ratio: "1:1" }
        })
    });

    if (!createRes.ok) {
        const err = await createRes.text();
        throw new Error(`图片提交失败 [${createRes.status}]: ${err}`);
    }

    const taskData = await createRes.json();
    const requestId = taskData.id || taskData.requestId;

    // 2. 轮询
    const pollUrl = `${baseUrl}/api/v1/ie/requestqueue/apikey/requests/${requestId}?key=${apiKey}`;
    let attempts = 0;
    while (attempts < 60) {
        await new Promise(r => setTimeout(r, 4000));
        const statusRes = await fetch(pollUrl);
        if (!statusRes.ok) continue;

        const status = await statusRes.json();
        if (status.status === 'SUCCEEDED' || status.done === true) {
            const result = status.response || status.result;
            const base64 = result?.generatedImages?.[0]?.image?.imageBytes || result?.imageBytes;
            if (base64) return `data:image/png;base64,${base64}`;
        }
        if (status.status === 'FAILED') throw new Error("生成任务失败");
        attempts++;
    }
    throw new Error("生成任务超时");
}

export const queryDictionary = async (userInput: string) => {
    const messages = [
        { 
            role: "system", 
            content: "You are a professional language tutor. Return ONLY a JSON object: { \"identifiedWord\": \"...\", \"definition\": \"...\", \"translation\": \"(Chinese)\", \"example\": \"...\", \"visualDescription\": \"(Scene for AI Image)\" }" 
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
        console.error("Image failed:", e);
        return getPlaceholder(word, "#FBBF24");
    }
};

export const generatePetSprite = async (stage: number): Promise<string> => {
    const stages = ["mystical egg", "baby creature", "teen creature", "mighty guardian"];
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
        { role: "user", content: `The pet just experienced: ${trigger}` }
    ];
    try {
        return await callOpenAITextAPI(messages);
    } catch (e) {
        return { text: "Wow!", mood: "happy" };
    }
};

export const generatePostcard = async (petName: string): Promise<string> => {
    const prompt = `Anime style postcard of ${petName} at a landmark.`;
    try {
        return await callSeedreamAsync(prompt);
    } catch (e) {
        return getPlaceholder("Postcard", "#6366F1");
    }
};
