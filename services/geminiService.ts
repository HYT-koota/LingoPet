
/**
 * 核心配置
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
 * 使用 v1beta 路径，这是 Gemini 1.5 系列最稳定的端点
 */
async function callGmiAPI(type: 'text' | 'image', model: string, payload: any) {
    const isImage = type === 'image';
    const apiKey = isImage ? process.env.IMAGE_API_KEY : process.env.TEXT_API_KEY;
    const proxyPath = isImage ? '/api/proxy/image' : '/api/proxy/text';
    
    // 关键修复：加入 v1beta 版本前缀。如果你的后端需要 v1，请将 v1beta 改为 v1
    const url = `${proxyPath}/v1beta/models/${model}:generateContent?key=${apiKey}`;

    if (!apiKey) {
        throw new Error(`${type.toUpperCase()} API Key 缺失，请检查环境变量。`);
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const contentType = response.headers.get("content-type");
        
        if (!response.ok) {
            let errorMsg = `HTTP Error ${response.status}`;
            if (contentType && contentType.includes("application/json")) {
                const errData = await response.json();
                errorMsg = errData.error?.message || errorMsg;
            } else {
                errorMsg = await response.text();
            }
            throw new Error(errorMsg);
        }

        if (contentType && contentType.includes("application/json")) {
            return await response.json();
        } else {
            throw new Error("API 返回了非 JSON 格式的内容");
        }
    } catch (e: any) {
        console.error(`[${type}] API Call Failed:`, e.message);
        throw e;
    }
}

/**
 * 词典查询 (GMI Serving)
 */
export const queryDictionary = async (userInput: string) => {
    const payload = {
        contents: [{ parts: [{ text: `Task: Dictionary definition for "${userInput}". Output JSON only.` }] }],
        generationConfig: { responseMimeType: "application/json" },
        systemInstruction: {
            parts: [{ text: "You are a professional language teacher. Return JSON with: identifiedWord, definition, example, translation (Simplified Chinese), visualDescription (detailed English scene description for image generation)." }]
        }
    };

    const data = await callGmiAPI('text', CURRENT_CONFIG.textModel, payload);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    try {
        return JSON.parse(text || '{}');
    } catch (e) {
        console.error("JSON Parse Error on:", text);
        throw new Error("无法解析词典响应数据");
    }
};

/**
 * 生成图片 (GMI Cloud - Seedream 4.0)
 */
export const generateCardImage = async (word: string, context?: string, visualDescription?: string): Promise<string> => {
    try {
        const description = visualDescription || `${word} in ${context}`;
        // Seedream 通常需要非常明确的 Prompt
        const prompt = `A clear, minimalist educational illustration of "${description}". Clean lines, vibrant colors, white background, high quality.`;
        
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            // 部分图片模型可能不支持 responseMimeType，如果报错可以移除下面这行
            generationConfig: { temperature: 1.0 } 
        };

        const data = await callGmiAPI('image', CURRENT_CONFIG.imageModel, payload);
        
        // 尝试从 candidates 中查找 inlineData
        const part = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
        if (part && part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
        
        throw new Error("Seedream 未返回图像数据。请检查模型权限或配额。");
    } catch (e) {
        console.error("Seedream Image Error:", e);
        return getPlaceholder(word, "#FBBF24");
    }
};

/**
 * 生成宠物形象 (GMI Cloud)
 */
export const generatePetSprite = async (stage: number): Promise<string> => {
    const stages = ["magical glowing egg", "cute little chick", "smart looking fox", "powerful dragon"];
    const prompt = `3D digital art, cute ${stages[stage]}, white background, centered, high definition, toy style.`;
    
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
    const payload = {
        contents: [{ parts: [{ text: `The pet ${petState.name} experienced: ${trigger}. Mood status: ${petState.mood}. Current XP: ${petState.xp}. Output a short cute English reaction and a mood in JSON.` }] }],
        generationConfig: { responseMimeType: "application/json" }
    };
    
    try {
        const data = await callGmiAPI('text', CURRENT_CONFIG.textModel, payload);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return JSON.parse(text || '{"text": "Happy to see you!", "mood": "happy"}');
    } catch (e) {
        return { text: "Let's study together!", mood: "happy" };
    }
};

/**
 * 生成旅行明信片 (GMI Cloud)
 */
export const generatePostcard = async (petName: string): Promise<string> => {
    const prompt = `A beautiful landscape postcard featuring a small pet ${petName} traveling in a fantasy world. Anime style, colorful.`;
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
