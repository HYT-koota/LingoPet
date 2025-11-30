// --- Generic API Service (Split Text & Image) ---

// 1. Text Configuration (Chat / Definitions)
const TEXT_KEY = process.env.TEXT_API_KEY || '';
const TEXT_BASE_URL = process.env.TEXT_API_BASE_URL || 'https://api.openai.com/v1';
const TEXT_MODEL = process.env.TEXT_API_MODEL || 'gpt-3.5-turbo';

// 2. Image Configuration (Visuals / Pet Sprites)
const IMAGE_KEY = process.env.IMAGE_API_KEY || '';
const IMAGE_BASE_URL = process.env.IMAGE_API_BASE_URL || 'https://api.openai.com/v1';
const IMAGE_MODEL = process.env.IMAGE_API_MODEL || 'dall-e-3';

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

    if (jsonMode && (TEXT_MODEL.includes('gpt') || TEXT_MODEL.includes('deepseek'))) {
        body.response_format = { type: "json_object" };
    }

    try {
        const response = await fetch(`${TEXT_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Text API Error ${response.status}: ${err}`);
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

    try {
        // Standard OpenAI Image Endpoint format
        const response = await fetch(`${IMAGE_BASE_URL}/images/generations`, {
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
             console.error("Image Gen Error Details:", errText);
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
    const prompt = `A cute, minimalistic, flat vector illustration of "${word}". Context: ${context}. White background.`;
    return await fetchImageGeneration(prompt);
  } catch (e) {
    console.warn("Using fallback image due to API error");
    return `https://picsum.photos/seed/${word}-${new Date().getDate()}/400/300`; 
  }
};

export const generatePetSprite = async (stage: number): Promise<string> => {
    let description = '';
    switch(stage) {
        case 0: description = "A mysterious, glowing magical egg, yellow patterns"; break;
        case 1: description = "A tiny, round baby creature, yellow and cream colors"; break;
        case 2: description = "A teenage cute creature, evolving features, yellow colors"; break;
        case 3: description = "A majestic fantasy creature, guardian spirit, gold colors"; break;
        default: description = "A cute spirit";
    }

    try {
        const prompt = `3D render of ${description}. Pixar style, cute, matte finish, white background, isometric view.`;
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
        const prompt = `A beautiful travel postcard landscape, artistic style, featuring a hidden small cute yellow creature.`;
        return await fetchImageGeneration(prompt);
    } catch(e) {
        return `https://picsum.photos/seed/travel-${Date.now()}/600/400`;
    }
}