
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

    const endpoint = `${IMAGE_BASE_URL}/images/generations`;

    try {
        console.log(`[Image API] Sending request to: ${endpoint} | Model: ${IMAGE_MODEL}`);

        // Standard OpenAI Image Endpoint format
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${IMAGE_KEY}`
            },
            body: JSON.stringify({
                model: IMAGE_MODEL, 
                prompt: prompt,
                n: 1,
                size: "1024x1024",
                response_format: "b64_json"
            })
        });

        if (!response.ok) {
             const errText = await response.text();
             console.error(`[Image API Error] Status: ${response.status}`, errText);
             throw new Error("Image API Failed");
        }
        
        const data = await response.json();
        if (data.data && data.data[0]) {
            if (data.data[0].b64_json) return `data:image/jpeg;base64,${data.data[0].b64_json}`;
            if (data.data[0].url) return data.data[0].url;
        }
        throw new Error("No image data received");
    } catch (e) {
        console.warn("Image API failed, using fallback logic...", e);
        throw e;
    }
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
export const generateCardImage = async (word: string, context?: string): Promise<string> => {
  try {
    // UPDATED PROMPT (Chinese): 极致清晰风格 (Sharp/High-Def)
    // Removed "soft/Ghibli" to avoid blur. Added "Macro/Product Shot/8k".
    const prompt = `一张极度清晰、锐利的摄影级图像，描绘内容：“${word}”。
    语境：${context}。
    风格：国家地理杂志级别的微距摄影，或者是电影级高精度的3D产品渲染。
    画质：8K超高清，HDR，纹理细节丰富，锐利聚焦（Sharp Focus），高对比度，色彩鲜艳。
    构图：主体居中，背景干净整洁，不要任何文字。`;
    
    return await fetchImageGeneration(prompt);
  } catch (e) {
    console.warn("Using fallback image due to API error");
    return `https://picsum.photos/seed/${word}-${new Date().getDate()}/400/300`; 
  }
};

export const generatePetSprite = async (stage: number): Promise<string> => {
    let description = '';
    let styleKeywords = '';

    // Specialized logic to ensure the Egg looks like an EGG, not a person.
    if (stage === 0) {
        description = "一颗放置在底座上的神秘魔法蛋。纯粹的蛋形物体，表面有发光的金色符文纹理。";
        // STRICT constraints for the egg
        styleKeywords = "风格：写实级C4D渲染，游戏道具设计，静物特写(Still Life)。负面约束：绝对不要长出五官，不要脸，不要手脚，不要人类特征，不要Q版人偶。";
    } else {
        // Logic for creatures (Baby/Teen/Adult)
        switch(stage) {
            case 1: description = "一只圆滚滚的幼年小怪兽（非人类），像皮卡丘或史莱姆，毛茸茸，黄色奶油色，大眼睛"; break;
            case 2: description = "一只少年期的奇幻生物（四足兽），正在进化，充满活力的姿势，身上有发光斑纹"; break;
            case 3: description = "一只威严的成年神兽，像龙或麒麟，金色盔甲，飘逸的尾巴，神圣感"; break;
            default: description = "奇幻生物";
        }
        // Keywords for creatures
        styleKeywords = "风格：皮克斯(Pixar)电影级别3D渲染，宝可梦(Pokemon)风格，精致的毛发和光泽，明亮的摄影棚光效，白色背景。";
    }

    try {
        const prompt = `一张高质量的3D渲染图。
        内容：${description}
        ${styleKeywords}
        视角：等轴正视图(Isometric)，全身照。
        画质：8K分辨率，超清晰，无噪点。`;
        
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

export const generatePostcard = async (petName: string): Promise<string> => {
    // Postcards are images
    try {
        // UPDATED PROMPT (Chinese): 清晰的风景
        const prompt = `一张令人惊叹的、极其清晰的旅行风景照片。
        内容：著名的世界地标。
        风格：新海诚(Makoto Shinkai)超高清动画电影背景，或者国家地理摄影。
        画质：8K分辨率，光影层次丰富，细节锐利。
        前景：画面角落藏着一只小小的黄色奇幻生物（背影或侧影）。`;
        return await fetchImageGeneration(prompt);
    } catch(e) {
        return `https://picsum.photos/seed/travel-${Date.now()}/600/400`;
    }
}
