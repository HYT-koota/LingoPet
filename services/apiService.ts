/**
 * 核心配置诊断
 * 注意：Vite define 只替换字面量 process.env.XXX，不能使用动态访问
 */
export const CURRENT_CONFIG = {
    // 文本 API (DeepSeek/智谱 - OpenAI 兼容)
    textModel: (import.meta as any).env.VITE_TEXT_API_MODEL || 'deepseek-chat',
    textBaseUrl: ((import.meta as any).env.VITE_TEXT_API_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
    hasTextKey: !!((import.meta as any).env.VITE_TEXT_API_KEY && (import.meta as any).env.VITE_TEXT_API_KEY !== ''),

    // 图像 API (SiliconFlow - OpenAI 兼容)
    imageModel: (import.meta as any).env.VITE_IMAGE_API_MODEL || 'Qwen/Qwen-Image',
    imageBaseUrl: ((import.meta as any).env.VITE_IMAGE_API_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/$/, ''),
    hasImageKey: !!((import.meta as any).env.VITE_IMAGE_API_KEY && (import.meta as any).env.VITE_IMAGE_API_KEY !== '')
};

// 【重要】在浏览器控制台打印配置信息
console.log("%c LingoPet 启动诊断 %c", "background:#FFAE0A;color:white;padding:2px 5px;border-radius:3px", "");
console.log("-> 文本模型:", CURRENT_CONFIG.textModel);
console.log("-> 文本地址:", CURRENT_CONFIG.textBaseUrl);
console.log("-> 文本密钥:", CURRENT_CONFIG.hasTextKey ? "✅" : "❌");
console.log("-> 图像模型:", CURRENT_CONFIG.imageModel);
console.log("-> 图像地址:", CURRENT_CONFIG.imageBaseUrl);
console.log("-> 图像密钥:", CURRENT_CONFIG.hasImageKey ? "✅" : "❌");

/**
 * 辅助：生成占位图
 */
function getPlaceholder(text: string, color: string = "#E5E7EB") {
    const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#F9FAFB"/><rect x="156" y="156" width="200" height="200" rx="40" fill="${color}" opacity="0.2"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20" fill="${color}">${text}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * OpenAI 兼容格式文本请求 (DeepSeek/智谱)
 */
async function callOpenAITextAPI(messages: any[], jsonMode: boolean = true) {
    const apiKey = (import.meta as any).env.VITE_TEXT_API_KEY;

    if (!apiKey) throw new Error("缺少 VITE_TEXT_API_KEY，请在环境变量中设置");

    const url = `${CURRENT_CONFIG.textBaseUrl}/v1/chat/completions`;

    const payload: any = {
        model: CURRENT_CONFIG.textModel,
        messages: messages,
        temperature: 0.7
    };

    // DeepSeek/智谱 可能不支持 response_format，用系统提示代替
    // 如果确实需要，可以启用下面这行
    // if (jsonMode) payload.response_format = { type: "json_object" };

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
        throw new Error(`[${response.status}] API 请求失败。模型: ${CURRENT_CONFIG.textModel}。错误: ${errorBody.substring(0, 200)}`);
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
            throw new Error("模型未返回合法的 JSON 格式，请检查系统提示词");
        }
    }
    return content;
}

/**
 * SiliconFlow/OpenAI 兼容图像生成
 */
async function callImageAPI(prompt: string): Promise<string> {
    const apiKey = (import.meta as any).env.VITE_IMAGE_API_KEY;
    if (!apiKey) throw new Error("缺少 VITE_IMAGE_API_KEY，请在环境变量中设置");

    const url = `${CURRENT_CONFIG.imageBaseUrl}/images/generations`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: CURRENT_CONFIG.imageModel,
            prompt: prompt,
            image_size: "512x512",
            num_inference_steps: 20,
            guidance_scale: 7.5,
            num_images: 1
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`图像生成失败 [${response.status}]: ${errorBody.substring(0, 200)}`);
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
        throw new Error("图像 API 未返回有效的图片 URL");
    }

    return imageUrl;
}

export const queryDictionary = async (userInput: string) => {
    const messages = [
        {
            role: "system",
            content: "You are a professional language tutor. Respond with a valid JSON object only, no extra text. Format: { \"identifiedWord\": \"word\", \"definition\": \"English meaning\", \"translation\": \"Chinese translation\", \"example\": \"example sentence\", \"visualDescription\": \"scene for AI image\" }"
        },
        { role: "user", content: `Explain: "${userInput}"` }
    ];
    return await callOpenAITextAPI(messages);
};

export const generateCardImage = async (word: string, context?: string, visualDescription?: string): Promise<string> => {
    try {
        const prompt = `3D digital art: ${word}. ${visualDescription || context}. White background, simple background, high quality.`;
        return await callImageAPI(prompt);
    } catch (e) {
        console.error("Image failed:", e);
        return getPlaceholder(word, "#FBBF24");
    }
};

export const generatePetSprite = async (stage: number): Promise<string> => {
    console.log(`[generatePetSprite] Generating sprite for stage ${stage}`);
    const stages = ["mystical glowing egg", "cute baby creature", "teen creature", "mighty guardian character"];
    const prompt = `Cute 3D ${stages[stage]}, character design, white background, simple background, high quality, centered.`;
    console.log(`[generatePetSprite] Prompt: ${prompt}`);
    try {
        const url = await callImageAPI(prompt);
        console.log(`[generatePetSprite] Successfully generated image URL: ${url?.substring(0, 80)}...`);
        return url;
    } catch (e) {
        console.error(`[generatePetSprite] Failed to generate image, using placeholder:`, e);
        return getPlaceholder("Pet", "#FCD34D");
    }
};

export const generatePetReaction = async (petState: any, stats: any, trigger: string) => {
    const messages = [
        {
            role: "system",
            content: "You are a cute virtual pet. Respond with a valid JSON object only, no extra text. Format: { \"text\": \"what the pet says\", \"mood\": \"happy|sleepy|excited|proud\" }"
        },
        { role: "user", content: `The pet just experienced: ${trigger}` }
    ];
    try {
        return await callOpenAITextAPI(messages);
    } catch (e) {
        return { text: "Wow!", mood: "happy" };
    }
};

export const generatePostcard = async (petName: string): Promise<string> => {
    const prompt = `Anime style postcard illustration of ${petName} at a beautiful landmark, travel postcard, white background.`;
    try {
        return await callImageAPI(prompt);
    } catch (e) {
        return getPlaceholder("Postcard", "#6366F1");
    }
};
