
/**
 * 核心配置：直接从 process.env 读取 Vite 注入的环境变量
 * 注意：此处不使用任何外部 SDK，防止其内部逻辑拦截请求或报错
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
 * 统一 API 调用函数
 * @param type 'text' (GMI Serving) | 'image' (GMI Cloud)
 */
async function callGmiAPI(type: 'text' | 'image', model: string, payload: any) {
    const isImage = type === 'image';
    const apiKey = isImage ? process.env.IMAGE_API_KEY : process.env.TEXT_API_KEY;
    
    // 使用 vercel.json 配置的代理路径
    const proxyPath = isImage ? '/api/proxy/image' : '/api/proxy/text';
    const url = `${proxyPath}/models/${model}:generateContent?key=${apiKey}`;

    if (!apiKey) {
        throw new Error(`${type.toUpperCase()} API Key is missing in environment variables.`);
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
        console.error(`API Error (${type}):`, data);
        throw new Error(data.error?.message || `API Request Failed (${response.status})`);
    }

    return data;
}

/**
 * 词典查询 (GMI Serving)
 */
export const queryDictionary = async (userInput: string) => {
    const payload = {
        contents: [{ parts: [{ text: `Define the word or phrase: "${userInput}"` }] }],
        generationConfig: { responseMimeType: "application/json" },
        systemInstruction: {
            parts: [{ text: "You are a language learning dictionary. Return JSON: { \"identifiedWord\": \"...\", \"definition\": \"...\", \"example\": \"...\", \"translation\": \"(Chinese)\", \"visualDescription\": \"(English scene description for AI drawing)\" }" }]
        }
    };

    const data = await callGmiAPI('text', CURRENT_CONFIG.textModel, payload);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    try {
        return JSON.parse(text || '{}');
    } catch (e) {
        throw new Error("Failed to parse dictionary JSON: " + text);
    }
};

/**
 * 生成图片 (GMI Cloud - Seedream 4.0)
 */
export const generateCardImage = async (word: string, context?: string, visualDescription?: string): Promise<string> => {
    try {
        const subject = visualDescription || `${word} in context: ${context}`;
        const prompt = `A minimalist high-quality educational flashcard of ${subject}, white background, flat design, 4k.`;
        
        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        const data = await callGmiAPI('image', CURRENT_CONFIG.imageModel, payload);
        
        const base64 = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
        if (!base64) throw new Error("No image data returned from Seedream model");
        
        return `data:image/png;base64,${base64}`;
    } catch (e) {
        console.error("Seedream Image Gen Failed:", e);
        return getPlaceholder(word, "#FBBF24");
    }
};

/**
 * 生成宠物形象 (GMI Cloud)
 */
export const generatePetSprite = async (stage: number): Promise<string> => {
    const stages = ["magical glowing egg", "cute yellow chick", "orange fox", "majestic dragon"];
    const prompt = `3D character, blind box style, ${stages[stage] || 'pet'}, white background, isolated, soft lighting.`;
    
    try {
        const data = await callGmiAPI('image', CURRENT_CONFIG.imageModel, {
            contents: [{ parts: [{ text: prompt }] }]
        });
        const base64 = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
        return base64 ? `data:image/png;base64,${base64}` : getPlaceholder("Pet", "#FCD34D");
    } catch (e) {
        return getPlaceholder("Pet", "#FCD34D");
    }
};

/**
 * 宠物互动反应 (GMI Serving)
 */
export const generatePetReaction = async (petState: any, stats: any, trigger: string) => {
    const prompt = `The pet ${petState.name} (Stage: ${petState.stage}) just experienced: ${trigger}. Generate a short cute reaction in English and a mood (happy/sleepy/excited/proud). Output JSON.`;
    
    try {
        const data = await callGmiAPI('text', CURRENT_CONFIG.textModel, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return JSON.parse(text || '{"text": "Happy to learn!", "mood": "happy"}');
    } catch (e) {
        return { text: "Let's keep going!", mood: "happy" };
    }
};

/**
 * 生成旅行明信片 (GMI Cloud)
 */
export const generatePostcard = async (petName: string): Promise<string> => {
    const prompt = `Artistic travel postcard, anime landscape, pet ${petName} wandering in a fantasy world, vibrant colors.`;
    try {
        const data = await callGmiAPI('image', CURRENT_CONFIG.imageModel, {
            contents: [{ parts: [{ text: prompt }] }]
        });
        const base64 = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
        return base64 ? `data:image/png;base64,${base64}` : getPlaceholder("Postcard", "#6366F1");
    } catch (e) {
        return getPlaceholder("Postcard", "#6366F1");
    }
};
