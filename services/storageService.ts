

import { DailyStats, PetState, PetStage, WordEntry } from '../types';

const KEYS = {
  WORDS: 'lingopet_words',
  PET: 'lingopet_pet_v2', // Versioned to ensure structure update
  STATS: 'lingopet_stats',
};

// --- Helpers ---
const getTodayStr = () => new Date().toISOString().split('T')[0];

// --- Words ---
export const getWords = (): WordEntry[] => {
  const data = localStorage.getItem(KEYS.WORDS);
  return data ? JSON.parse(data) : [];
};

export const saveWord = (newWord: WordEntry) => {
  const words = getWords();
  const existingIndex = words.findIndex(w => w.word.toLowerCase() === newWord.word.toLowerCase());
  if (existingIndex >= 0) {
    words[existingIndex] = { ...words[existingIndex], ...newWord, id: words[existingIndex].id };
  } else {
    words.push(newWord);
  }
  localStorage.setItem(KEYS.WORDS, JSON.stringify(words));
};

export const updateWord = (id: string, updates: Partial<WordEntry>) => {
  const words = getWords();
  const idx = words.findIndex(w => w.id === id);
  if (idx !== -1) {
    words[idx] = { ...words[idx], ...updates };
    localStorage.setItem(KEYS.WORDS, JSON.stringify(words));
  }
};

// --- Pet ---
const INITIAL_PET: PetState = {
  name: 'Pika',
  stage: PetStage.EGG,
  xp: 0,
  cycle: 1,
  mood: 'sleepy',
  lastInteraction: Date.now(),
  dailyQuote: "Zzz... (I'm waiting to be born!)",
  dailyQuoteDate: '',
  isTraveling: false,
  postcardCollection: [],
  imageUrls: {} 
};

export const getPetState = (): PetState => {
  const data = localStorage.getItem(KEYS.PET);
  if (data) {
      const parsed = JSON.parse(data);
      // Migration for existing users
      if (!parsed.imageUrls) parsed.imageUrls = {};
      
      // --- CACHE BUSTING FIX ---
      // Force clear the Egg image (Stage 0) every time to fix the "Ugly/Humanoid" cache issue.
      // This ensures the user sees the new API result immediately on refresh.
      if (parsed.stage === PetStage.EGG) {
         delete parsed.imageUrls[0];
      }
      
      return parsed;
  }
  return INITIAL_PET;
};

export const savePetState = (pet: PetState) => {
  try {
      localStorage.setItem(KEYS.PET, JSON.stringify(pet));
  } catch (e) {
      console.error("Storage full, clearing images cache to save state");
      // Fallback if storage is full: clear cached images to save vital state
      const slimPet = { ...pet, imageUrls: {} };
      localStorage.setItem(KEYS.PET, JSON.stringify(slimPet));
  }
};

// --- Stats ---
export const getDailyStats = (): DailyStats => {
  const today = getTodayStr();
  const data = localStorage.getItem(KEYS.STATS);
  if (data) {
    const stats: DailyStats = JSON.parse(data);
    if (stats.date === today) return stats;
  }
  return { date: today, wordsAdded: 0, reviewSessionDone: false };
};

export const updateDailyStats = (updates: Partial<DailyStats>) => {
  const current = getDailyStats();
  const updated = { ...current, ...updates };
  localStorage.setItem(KEYS.STATS, JSON.stringify(updated));
  return updated;
};

// --- Spaced Repetition Logic ---
const INTERVALS = [1, 3, 7, 14, 30];

export const calculateNextReview = (currentLevel: number, wasCorrect: boolean): { level: number, date: number } => {
  if (!wasCorrect) {
    return { level: 0, date: Date.now() }; 
  }
  
  const nextLevel = Math.min(currentLevel + 1, INTERVALS.length);
  const daysToAdd = INTERVALS[Math.max(0, nextLevel - 1)];
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + daysToAdd);
  
  return { level: nextLevel, date: nextDate.getTime() };
};
