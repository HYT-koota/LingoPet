import { GoogleGenAI, Type } from '@google/genai';

// Robust Environment Variable Helper
// Checks process.env (Node/CRA) and import.meta.env (Vite/Vercel)
// Also checks for VITE_ prefixed keys automatically
const getEnv = (key: string): string => {
  let val = '';
  
  // 1. Try standard process.env (if defined)
  try {
    if (typeof process !== 'undefined' && process.env) {
      val = process.env[key] || process.env[`VITE_${key}`] || process.env[`REACT_APP_${key}`] || '';
    }
  } catch (e) {}

  if (val) return val;

  // 2. Try import.meta.env (Vite standard)
  try {
    // @ts-ignore
    if (import.meta && import.meta.env) {
      // @ts-ignore
      val = import.meta.env[key] || import.meta.env[`VITE_${key}`] || '';
    }
  } catch (e) {}

  return val;
};

// Prioritize specific keys, fallback to generic API_KEY
const textKey = getEnv('TEXT_API_KEY') || getEnv('API_KEY') || '';
const imageKey = getEnv('IMAGE_API_KEY') || getEnv('API_KEY') || '';

// Allow Model Configuration via Env Vars (with safe defaults)
const TEXT_MODEL = getEnv('TEXT_MODEL') || 'gemini-2.5-flash';
const IMAGE_MODEL = getEnv('IMAGE_MODEL') || 'imagen-3.0-generate-001';

// Create separate instances for Text and Image operations
const textAI = new GoogleGenAI({ apiKey: textKey });
const imageAI = new GoogleGenAI({ apiKey: imageKey });

// --- Dictionary & Note Taking ---
export const queryDictionary = async (userInput: string) => {
  if (!textKey) {
      console.error("Missing API Key");
      return null;
  }

  try {
      // Use textAI for text generation
      const response = await textAI.models.generateContent({
        model: TEXT_MODEL,
        contents: `User query: "${userInput}". 
        Identify the main target English word or phrase the user is asking about. 
        Provide a simple definition suitable for a learner.
        Provide a short example sentence.
        Return JSON.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              identifiedWord: { type: Type.STRING, description: "The core word being asked about, e.g., 'attention'" },
              definition: { type: Type.STRING, description: "A concise dictionary definition" },
              example: { type: Type.STRING, description: "A usage example sentence" },
              translation: { type: Type.STRING, description: "Chinese translation of the word" }
            },
            required: ["identifiedWord", "definition", "example", "translation"]
          }
        }
      });

      return response.text ? JSON.parse(response.text) : null;
  } catch (e) {
      console.error("Dictionary Query Failed:", e);
      return null;
  }
};

// --- Image Generation for Flashcards ---
export const generateCardImage = async (word: string, context?: string): Promise<string> => {
  // Use imageAI for image generation
  if (!imageKey) return `https://picsum.photos/seed/${word}/400/300`; 

  try {
    const response = await imageAI.models.generateImages({
        model: IMAGE_MODEL,
        prompt: `A simple, cute, clear vector-style illustration of the concept "${word}". Context: ${context}. White background, minimalistic, flat design, suitable for language learning cards.`,
        config: {
            numberOfImages: 1,
            aspectRatio: '4:3',
            outputMimeType: 'image/jpeg'
        }
    });

    const base64ImageBytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (base64ImageBytes) {
        return `data:image/jpeg;base64,${base64ImageBytes}`;
    }
    throw new Error("No image generated");

  } catch (e) {
    console.error("Image generation failed", e);
    return `https://picsum.photos/seed/${word}-${new Date().getDate()}/400/300`; 
  }
};

// --- Pet Visuals ---
export const generatePetSprite = async (stage: number): Promise<string> => {
    if (!imageKey) return '';
    
    let description = '';
    switch(stage) {
        case 0: description = "A mysterious, glowing magical egg, cream and yellow patterns"; break;
        case 1: description = "A tiny, adorable, round baby creature (like a baby Pikachu or slime), very cute, big eyes, yellow and cream colors"; break;
        case 2: description = "A teenage cute creature, energetic, evolving features, standing up, yellow and cream fur"; break;
        case 3: description = "A fully grown, majestic but cute fantasy creature, friendly guardian spirit, yellow, gold and cream colors"; break;
        default: description = "A cute spirit";
    }

    try {
        // Use imageAI
        const response = await imageAI.models.generateImages({
            model: IMAGE_MODEL,
            prompt: `A high-quality 3D render of ${description}. Theme: Warm Yellow, Buttercream, and Gold colors. Pixar style, soft studio lighting, cute, round shapes, matte finish, plain white background, isometric view.`,
            config: {
                numberOfImages: 1,
                aspectRatio: '1:1',
                outputMimeType: 'image/jpeg'
            }
        });
        const b64 = response.generatedImages?.[0]?.image?.imageBytes;
        return b64 ? `data:image/jpeg;base64,${b64}` : '';
    } catch (e) {
        console.error("Pet gen failed", e);
        return '';
    }
}

// --- Pet Interaction ---
export const generatePetReaction = async (
  petState: any, 
  stats: any, 
  trigger: 'greeting' | 'completed_task' | 'evolving' | 'traveling'
) => {
  if (!textKey) return { text: "Pika pika!", mood: "happy" };

  const prompt = `
    You are a virtual pet named ${petState.name}.
    Current Stage: ${petState.stage}.
    Trigger: ${trigger}.
    Keep it very short (max 15 words). Cute and encouraging tone.
    Output JSON: { "text": "short cute sentence", "mood": "happy" | "excited" | "sleepy" | "proud" }
  `;

  try {
    // Use textAI
    const response = await textAI.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                text: { type: Type.STRING },
                mood: { type: Type.STRING, enum: ['happy', 'excited', 'sleepy', 'proud'] }
            }
        }
      }
    });
    return response.text ? JSON.parse(response.text) : { text: "Yay!", mood: "happy" };
  } catch (e) {
    return { text: "I'm happy!", mood: "happy" };
  }
};

export const generatePostcard = async (petName: string): Promise<string> => {
    if (!imageKey) return `https://picsum.photos/seed/travel/600/400`;
    try {
        // Use imageAI
        const response = await imageAI.models.generateImages({
            model: IMAGE_MODEL,
            prompt: `A watercolor postcard of a cute yellow/cream mascot named ${petName} in a beautiful travel location.`,
            config: { numberOfImages: 1, aspectRatio: '16:9' }
        });
        const b64 = response.generatedImages?.[0]?.image?.imageBytes;
        return b64 ? `data:image/jpeg;base64,${b64}` : '';
    } catch {
        return `https://picsum.photos/seed/travel-${Date.now()}/600/400`;
    }
}