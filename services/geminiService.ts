import { GoogleGenAI, Type } from '@google/genai';

// --- Configuration ---
// @ts-ignore
const VITE_KEY = import.meta.env.VITE_API_KEY ?? '';

// Fallback for non-Vite environments
const PROCESS_KEY = (typeof process !== 'undefined' && process.env) ? (process.env.VITE_API_KEY || process.env.API_KEY) : '';

const API_KEY = VITE_KEY || PROCESS_KEY || '';

// Initialize Client
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

// Export config for UI Diagnostics
export const CURRENT_CONFIG = {
    textModel: 'gemini-2.5-flash (Hardcoded)',
    imageModel: 'gemini-2.5-flash-image (Hardcoded)',
    hasTextKey: !!API_KEY,
    hasImageKey: !!API_KEY
};

// --- Dictionary & Note Taking ---
export const queryDictionary = async (userInput: string) => {
  if (!ai) throw new Error("Missing API Key. Please configure VITE_API_KEY in Vercel Settings.");
  
  try {
      // FORCE HARDCODED MODEL - IGNORE ENV VARS
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
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

      if (!response.text) throw new Error("Empty response from AI");
      return JSON.parse(response.text);
  } catch (e: any) {
      console.error("Dictionary Query Failed:", e);
      let msg = e.message || "Failed to fetch definition";
      // Provide clearer error messages based on common API failures
      if (msg.includes("400")) msg = "Invalid Request (400). Check API Key.";
      if (msg.includes("404")) msg = "Model not found. Google API Issue.";
      if (msg.includes("Failed to fetch")) msg = "Network Error / CORS Blocked.";
      throw new Error(msg);
  }
};

// --- Image Generation for Flashcards ---
export const generateCardImage = async (word: string, context?: string): Promise<string> => {
  if (!ai) return `https://picsum.photos/seed/${word}/400/300`;

  try {
    // FORCE HARDCODED MODEL - IGNORE ENV VARS
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [{
                text: `A simple, cute, clear vector-style illustration of the concept "${word}". Context: ${context}. White background, minimalistic, flat design, suitable for language learning cards.`
            }]
        },
        config: {
            imageConfig: {
                aspectRatio: '4:3'
            }
        }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:image/jpeg;base64,${part.inlineData.data}`;
        }
    }
    throw new Error("No image generated");

  } catch (e) {
    console.error("Image generation failed", e);
    return `https://picsum.photos/seed/${word}-${new Date().getDate()}/400/300`; 
  }
};

// --- Pet Visuals ---
export const generatePetSprite = async (stage: number): Promise<string> => {
    if (!ai) return '';

    let description = '';
    switch(stage) {
        case 0: description = "A mysterious, glowing magical egg, cream and yellow patterns"; break;
        case 1: description = "A tiny, adorable, round baby creature (like a baby Pikachu or slime), very cute, big eyes, yellow and cream colors"; break;
        case 2: description = "A teenage cute creature, energetic, evolving features, standing up, yellow and cream colors"; break;
        case 3: description = "A fully grown, majestic but cute fantasy creature, friendly guardian spirit, yellow, gold and cream colors"; break;
        default: description = "A cute spirit";
    }

    try {
        // FORCE HARDCODED MODEL - IGNORE ENV VARS
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{
                    text: `A high-quality 3D render of ${description}. Theme: Warm Yellow, Buttercream, and Gold colors. Pixar style, soft studio lighting, cute, round shapes, matte finish, plain white background, isometric view.`
                }]
            },
            config: {
                imageConfig: {
                    aspectRatio: '1:1'
                }
            }
        });
        
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:image/jpeg;base64,${part.inlineData.data}`;
            }
        }
        return '';
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
  if (!ai) return { text: "Hello! (Check VITE_API_KEY)", mood: "happy" };

  const prompt = `
    You are a virtual pet named ${petState.name}.
    Current Stage: ${petState.stage}.
    Trigger: ${trigger}.
    Keep it very short (max 15 words). Cute and encouraging tone.
    Output JSON: { "text": "short cute sentence", "mood": "happy" | "excited" | "sleepy" | "proud" }
  `;

  try {
    // FORCE HARDCODED MODEL - IGNORE ENV VARS
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
    if (!ai) return `https://picsum.photos/seed/travel-${Date.now()}/600/400`;
    
    try {
        // FORCE HARDCODED MODEL - IGNORE ENV VARS
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{
                    text: `A watercolor postcard of a cute yellow/cream mascot named ${petName} in a beautiful travel location.`
                }]
            },
            config: {
                imageConfig: {
                    aspectRatio: '16:9'
                }
            }
        });
        
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:image/jpeg;base64,${part.inlineData.data}`;
            }
        }
        return '';
    } catch {
        return `https://picsum.photos/seed/travel-${Date.now()}/600/400`;
    }
}