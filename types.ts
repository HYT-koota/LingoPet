
export enum AppMode {
  HOME = 'HOME',
  DICTIONARY = 'DICTIONARY',
  REVIEW = 'REVIEW',
  PET_PROFILE = 'PET_PROFILE',
  NOTEBOOK = 'NOTEBOOK'
}

export enum PetStage {
  EGG = 0,
  BABY = 1,
  TEEN = 2,
  ADULT = 3,
  DEPARTED = 4
}

export type ReviewMode = 'passive' | 'active';

export interface WordEntry {
  id: string;
  word: string;
  definition: string; // Basic meaning (English)
  translation?: string; // Chinese meaning (New field)
  context: string; // Example sentence
  visualDescription?: string; // Scene description for image gen
  addedAt: number; // Timestamp
  lastReviewedAt: number | null;
  reviewLevel: number; // 0-5 for Spaced Repetition
  nextReviewDate: number; // Timestamp
  todayImage?: string; // URL/Base64 for today's generated image
  todayImageDate?: string; // YYYY-MM-DD to check if image is stale
}

export interface PetState {
  name: string;
  stage: PetStage;
  xp: number;
  cycle: number; // How many pets have you raised?
  mood: 'happy' | 'sleepy' | 'excited' | 'proud';
  lastInteraction: number;
  dailyQuote: string; // Generated daily
  dailyQuoteDate: string; // YYYY-MM-DD
  isTraveling: boolean;
  travelReturnTime?: number;
  postcardCollection: string[]; // URLs of postcards
  imageUrls: Record<number, string>; // Cache generated pet images per stage
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  wordsAdded: number;
  reviewSessionDone: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  isError?: boolean;
}
