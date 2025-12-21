
import { GoogleGenAI, Type } from "@google/genai";

// Initialize the Google GenAI SDK using the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Application configuration used for diagnostics and model references.
export const CURRENT_CONFIG = {
    textModel: 'gemini-3-flash-preview',
    imageModel: 'gemini-2.5-flash-image',
    hasTextKey: !!process.env.API_KEY,
    hasImageKey: !!process.env.API_KEY
};

/**
 * Generates a simple SVG placeholder image for fallbacks when API calls fail.
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
 * Fetches dictionary information for a word using Gemini 3 Flash.
 * Returns a JSON object with definition, example, translation, and visual description.
 */
export const queryDictionary = async (userInput: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Define the word or phrase: "${userInput}"`,
    config: {
      systemInstruction: "You are a helpful dictionary assistant. Provide details about the word in JSON format including identifiedWord, definition, example, translation (Chinese), and visualDescription (English scene description for AI image generation).",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          identifiedWord: { type: Type.STRING },
          definition: { type: Type.STRING },
          example: { type: Type.STRING },
          translation: { type: Type.STRING },
          visualDescription: { type: Type.STRING }
        },
        required: ["identifiedWord", "definition", "example", "translation", "visualDescription"]
      }
    }
  });
  
  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error("Failed to parse dictionary response", e);
    throw new Error("Invalid dictionary response format");
  }
};

/**
 * Generates an educational flashcard image for a word using Gemini 2.5 Flash Image.
 */
export const generateCardImage = async (word: string, context?: string, visualDescription?: string): Promise<string> => {
  try {
    const subject = visualDescription || `${word} (context: ${context})`;
    const prompt = `A high-quality, minimalist educational flashcard illustration of: ${subject}. Flat design, vibrant colors, white background, center composition, 4k.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] }
    });

    // Iterate through response parts to find the generated image data.
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned from model");
  } catch (e) {
    console.error("Card image generation failed", e);
    return getPlaceholder(word, "#FBBF24");
  }
};

/**
 * Generates a character sprite based on the pet's evolution stage.
 */
export const generatePetSprite = async (stage: number): Promise<string> => {
    let description = "";
    if (stage === 0) description = "a cute magical glowing pet egg with star patterns";
    else if (stage === 1) description = "a cute round yellow chibi chick, big eyes";
    else if (stage === 2) description = "a cute mischievous chibi orange fox, fluffy tail";
    else if (stage === 3) description = "a majestic fantasy winged creature, elegant chibi style";

    const prompt = `3D character model, blind box toy style, ${description}, soft clay texture, isolated on white background, front view, masterpiece.`;
    try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: prompt }] }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        throw new Error("No image data returned from model");
    } catch (e) {
        console.error("Pet sprite generation failed", e);
        return getPlaceholder("Pet", "#FCD34D");
    }
}

/**
 * Generates a dialogue reaction and mood based on pet status and events.
 */
export const generatePetReaction = async (petState: any, stats: any, trigger: string) => {
    const prompt = `Event: ${trigger}. Pet Name: ${petState.name}, Stage: ${petState.stage}, XP: ${petState.xp}, Words Added Today: ${stats.wordsAdded}.`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
            systemInstruction: "You are the pet's consciousness. Generate a short, cute reaction message in English and an appropriate mood. Mood must be one of: happy, sleepy, excited, proud. Output JSON.",
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    text: { type: Type.STRING },
                    mood: { type: Type.STRING, enum: ["happy", "sleepy", "excited", "proud"] }
                },
                required: ["text", "mood"]
            }
        }
    });
    
    try {
        return JSON.parse(response.text || '{}');
    } catch (e) {
        return { text: "Wow! I'm learning so much!", mood: "happy" };
    }
};

/**
 * Generates a travel postcard image for the pet's journey memories.
 */
export const generatePostcard = async (petName: string): Promise<string> => {
    const prompt = `A beautiful travel postcard from a far away fantasy land, featuring ${petName}'s silhouette exploring a scenic landmark, artistic illustration style, vibrant colors, "Greetings from far away" text integrated, 4k.`;
    try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: prompt }] }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        throw new Error("No image data returned from model");
    } catch (e) {
        console.error("Postcard generation failed", e);
        return getPlaceholder("Postcard", "#6366F1");
    }
};
