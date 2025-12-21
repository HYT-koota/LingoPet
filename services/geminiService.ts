
import { GoogleGenAI, Type } from "@google/genai";

// Use gemini-3-flash-preview for general text tasks and gemini-2.5-flash-image for images.
export const CURRENT_CONFIG = {
    textModel: 'gemini-3-flash-preview',
    imageModel: 'gemini-2.5-flash-image',
    hasTextKey: !!process.env.API_KEY, 
    hasImageKey: !!process.env.API_KEY
};

/**
 * Creates a placeholder image in case of API failure.
 */
function getPlaceholder(text: string, color: string = "#E5E7EB") {
    const svg = `
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <rect width="512" height="512" fill="#F9FAFB"/>
        <rect x="156" y="156" width="200" height="200" rx="40" fill="${color}" opacity="0.2"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="${color}" opacity="0.6">${text}</text>
        <path d="M256 200 L256 312 M200 256 L312 256" stroke="${color}" stroke-width="20" stroke-linecap="round" opacity="0.4"/>
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Define a word using gemini-3-flash-preview with structured JSON output.
 */
export const queryDictionary = async (userInput: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const response = await ai.models.generateContent({
    model: CURRENT_CONFIG.textModel,
    contents: `Define the English word: "${userInput}"`,
    config: {
      systemInstruction: "You are a helpful dictionary assistant. Provide the word's definition, an example sentence, its Chinese translation, and a concise visual description for an AI image generator. Output MUST be valid JSON.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          identifiedWord: { type: Type.STRING, description: "The confirmed English word." },
          definition: { type: Type.STRING, description: "The English definition." },
          example: { type: Type.STRING, description: "An example sentence." },
          translation: { type: Type.STRING, description: "The Chinese translation." },
          visualDescription: { type: Type.STRING, description: "A simple visual scene description for image generation." }
        },
        required: ["identifiedWord", "definition", "example", "translation", "visualDescription"]
      }
    },
  });

  try {
    const jsonStr = response.text || "{}";
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error("JSON parsing error:", e);
    throw new Error("Failed to parse dictionary API response.");
  }
};

/**
 * Generate a flashcard image using gemini-2.5-flash-image.
 */
export const generateCardImage = async (word: string, context?: string, visualDescription?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const subject = visualDescription || `${word} (context: ${context})`;
  const prompt = `A minimalist educational flashcard illustration of: ${subject}. Flat design, vibrant colors, white background, center composition.`;
  
  try {
    const response = await ai.models.generateContent({
      model: CURRENT_CONFIG.imageModel,
      contents: [{ parts: [{ text: prompt }] }],
    });

    // Iterate through all parts to find the image part
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image part found in response.");
  } catch (e) {
    console.error("Image generation failed:", e);
    return getPlaceholder(word, "#FBBF24");
  }
};

/**
 * Generate a pet sprite image using gemini-2.5-flash-image.
 */
export const generatePetSprite = async (stage: number): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    let description = "";
    if (stage === 0) description = "a cute magical glowing pet egg with star patterns";
    else if (stage === 1) description = "a cute round yellow chibi chick, big eyes";
    else if (stage === 2) description = "a cute mischievous chibi orange fox, fluffy tail";
    else if (stage === 3) description = "a majestic fantasy winged creature, elegant chibi style";

    const prompt = `3D character model, blind box toy style, ${description}, soft clay texture, isolated on pure white background, front view.`;
    
    try {
        const response = await ai.models.generateContent({
            model: CURRENT_CONFIG.imageModel,
            contents: [{ parts: [{ text: prompt }] }],
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        return getPlaceholder("Pet", "#FCD34D");
    } catch (e) {
        console.error("Pet sprite generation failed:", e);
        return getPlaceholder("Pet", "#FCD34D");
    }
}

/**
 * Generate a pet reaction message using gemini-3-flash-preview.
 */
export const generatePetReaction = async (petState: any, stats: any, trigger: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const response = await ai.models.generateContent({
    model: CURRENT_CONFIG.textModel,
    contents: `Trigger Event: ${trigger}. Current XP: ${petState.xp}. Daily Words: ${stats.wordsAdded}.`,
    config: {
      systemInstruction: `You are ${petState.name}, a helpful virtual pet. React to the user's progress. Use a tone matching your current mood. Output JSON.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: "The message from the pet." },
          mood: { type: Type.STRING, description: "Choose from: happy, sleepy, excited, proud." }
        },
        required: ["text", "mood"]
      }
    },
  });
  
  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    return { text: "Keep going! You're doing great!", mood: "happy" };
  }
};

/**
 * Generate a travel postcard image using gemini-2.5-flash-image.
 */
export const generatePostcard = async (petName: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const prompt = `Beautiful anime scenery landscape photography, vibrant colors, 4k resolution.`;
    try {
        const response = await ai.models.generateContent({
            model: CURRENT_CONFIG.imageModel,
            contents: [{ parts: [{ text: prompt }] }],
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
        return getPlaceholder("Travel", "#60A5FA");
    } catch(e) {
        return getPlaceholder("Travel", "#60A5FA");
    }
};
