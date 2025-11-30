
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
    // UPDATED PROMPT (Chinese): 吉卜力/治愈系插画风格
    const prompt = `一张高质量、柔和的数字插画，描绘内容：“${word}”。
    语境：${context}。
    风格：宫崎骏吉卜力风格，治愈系，粉彩配色，柔和光照，杰作，4k分辨率，高细节。
    构图：居中，干净的米白色背景。无文字。`;
    
    return await fetchImageGeneration(prompt);
  } catch (e) {
    console.warn("Using fallback image due to API error");
    return `https://picsum.photos/seed/${word}-${new Date().getDate()}/400/300`; 
  }
};

export const generatePetSprite = async (stage: number): Promise<string> => {
    let description = '';
    switch(stage) {
        case 0: description = "神秘的发光魔法蛋，带有金色符文图案，散发着神秘光环"; break;
        case 1: description = "可爱的圆形幼年生物（类似宝可梦风格），小巧嘟嘟，黄色和奶油色的皮毛，大眼睛"; break;
        case 2: description = "少年期的奇幻生物，正在进化的特征，充满活力的姿势，黄色和橙色的发光点缀"; break;
        case 3: description = "威严的守护神兽，带有金色盔甲元素，飘逸的尾巴，既强大又可爱"; break;
        default: description = "可爱的精灵生物";
    }

    try {
        // UPDATED PROMPT (Chinese): 盲盒/泡泡玛特 3D 风格
        const prompt = `一张高质量的3D渲染图，内容是：${description}。
        风格：盲盒玩具设计，泡泡玛特(Pop Mart)风格，C4D渲染，OC渲染，粘土材质，柔和摄影棚光效，可爱，Q版比例。
        视角：等轴正视图。
        背景：纯白背景，干净无杂物。`;
        
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
        // UPDATED PROMPT (Chinese): 新海诚/二次元风景风格
        const prompt = `一张令人惊叹的著名世界地标风景数字绘画。
        风格：新海诚动漫背景风格，充满活力的蓝天，电影级光效，高度细节，杰作。
        前景：一只黄色的小型奇幻萌物（宠物）正在自拍或躲在场景中。`;
        return await fetchImageGeneration(prompt);
    } catch(e) {
        return `https://picsum.photos/seed/travel-${Date.now()}/600/400`;
    }
}
