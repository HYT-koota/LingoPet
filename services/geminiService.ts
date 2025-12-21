
// 使用原生 fetch 以适配自定义 GMI Cloud / Serving 端点
// 接口遵循 Gemini API 协议格式

export const CURRENT_CONFIG = {
    textModel: 'gemini-1.5-flash', // GMI Serving 常用文本模型
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
 * 核心请求函数：支持文本和图片 API
 * 使用 vercel.json 定义的代理路径 /api/proxy/text 和 /api/proxy/image
 */
async function callGeminiAPI(type: 'text' | 'image', model: string, payload: any) {
    const isImage = type === 'image';
    const apiKey = isImage ? process.env.IMAGE_API_KEY : process.env.TEXT_API_KEY;
    const baseUrl = isImage ? '/api/proxy/image' : '/api/proxy/text';
    
    // 构造 Gemini 协议的请求 URL
    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`API Error (${response.status}): ${err}`);
    }

    return await response.json();
}

/**
 * 词典查询：使用 GMI Serving
 */
export const queryDictionary = async (userInput: string) => {
    const payload = {
        contents: [{ parts: [{ text: `Define the word or phrase: "${userInput}"` }] }],
        generationConfig: {
            responseMimeType: "application/json",
            // 由于某些第三方转发不支持 responseSchema 参数，这里通过 systemInstruction 强制约束
        },
        systemInstruction: {
            parts: [{ text: "You are a dictionary. Return JSON only with fields: identifiedWord, definition, example, translation (Chinese), visualDescription (English scene)." }]
        }
    };

    const data = await callGeminiAPI('text', CURRENT_CONFIG.textModel, payload);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    try {
        return JSON.parse(text || '{}');
    } catch (e) {
        console.error("JSON Parse Error", text);
        throw new Error("Failed to parse dictionary response");
    }
};

/**
 * 生成图片：使用 GMI Cloud (Seedream 4.0)
 */
export const generateCardImage = async (word: string, context?: string, visualDescription?: string): Promise<string> => {
    try {
        const subject = visualDescription || `${word} (context: ${context})`;
        const prompt = `A minimalist educational flashcard illustration of: ${subject}. Flat design, vibrant colors, white background, center composition, 4k.`;
        
        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        const data = await callGeminiAPI('image', CURRENT_CONFIG.imageModel, payload);
        
        // 解析返回的 base64 图像
        for (const part of data.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        throw new Error("No image data in response");
    } catch (e) {
        console.error("Image Gen Error", e);
        return getPlaceholder(word, "#FBBF24");
    }
};

/**
 * 生成宠物形象
 */
export const generatePetSprite = async (stage: number): Promise<string> => {
    let desc = ["a magical glowing egg", "a cute yellow chick", "a mischievous fox", "a majestic dragon"][stage] || "a pet";
    const prompt = `3D character model, blind box toy style, ${desc}, soft clay texture, isolated on white background, front view.`;
    
    try {
        const data = await callGeminiAPI('image', CURRENT_CONFIG.imageModel, {
            contents: [{ parts: [{ text: prompt }] }]
        });
        
        const base64 = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
        return base64 ? `data:image/png;base64,${base64}` : getPlaceholder("Pet", "#FCD34D");
    } catch (e) {
        return getPlaceholder("Pet", "#FCD34D");
    }
};

/**
 * 宠物互动反应
 */
export const generatePetReaction = async (petState: any, stats: any, trigger: string) => {
    const prompt = `Event: ${trigger}. Pet: ${petState.name}, XP: ${petState.xp}. Respond in JSON { "text": "...", "mood": "happy/sleepy/excited/proud" }`;
    
    try {
        const data = await callGeminiAPI('text', CURRENT_CONFIG.textModel, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return JSON.parse(text || '{"text": "Wow!", "mood": "happy"}');
    } catch (e) {
        return { text: "Keep learning!", mood: "happy" };
    }
};

/**
 * 生成旅行明信片
 */
export const generatePostcard = async (petName: string): Promise<string> => {
    const prompt = `A beautiful landscape travel postcard from a fantasy world, featuring the silhouette of a pet named ${petName}, artistic anime style, vibrant colors.`;
    try {
        const data = await callGeminiAPI('image', CURRENT_CONFIG.imageModel, {
            contents: [{ parts: [{ text: prompt }] }]
        });
        const base64 = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
        return base64 ? `data:image/png;base64,${base64}` : getPlaceholder("Postcard", "#6366F1");
    } catch (e) {
        return getPlaceholder("Postcard", "#6366F1");
    }
};
