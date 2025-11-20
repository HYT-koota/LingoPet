import { GoogleGenAI, Type } from '@google/genai';

// Prioritize specific keys, fallback to generic API_KEY
const textKey = process.env.TEXT_API_KEY || process.env.API_KEY || '';
const imageKey = process.env.IMAGE_API_KEY || process.env.API_KEY || '';

// Create separate instances for Text and Image operations
const textAI = new GoogleGenAI({ apiKey: textKey });
const imageAI = new GoogleGenAI({ apiKey: imageKey });

// --- Dictionary & Note Taking ---
export const queryDictionary = async (userInput: string) => {
  if (!textKey) throw new Error("No Text API Key provided");

  // Use textAI for text generation
  const response = await textAI.models.generateContent({
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

  return response.text ? JSON.parse(response.text) : null;
};

// --- Image Generation for Flashcards ---
export const generateCardImage = async (word: string, context?: string): Promise<string> => {
  // Use imageAI for image generation
  if (!imageKey) return `https://picsum.photos/seed/${word}/400/300`; 

  try {
    const response = await imageAI.models.generateImages({
        model: 'imagen-4.0-generate-001',
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
            model: 'imagen-4.0-generate-001',
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
    if (!imageKey) return `https://picsum.photos/seed/travel/600/400`;
    try {
        // Use imageAI
        const response = await imageAI.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: `A watercolor postcard of a cute yellow/cream mascot named ${petName} in a beautiful travel location.`,
            config: { numberOfImages: 1, aspectRatio: '16:9' }
        });
        const b64 = response.generatedImages?.[0]?.image?.imageBytes;
        return b64 ? `data:image/jpeg;base64,${b64}` : '';
    } catch {
        return `https://picsum.photos/seed/travel-${Date.now()}/600/400`;
    }
}