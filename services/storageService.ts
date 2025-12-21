
import { DailyStats, PetState, PetStage, WordEntry } from '../types';

const KEYS = {
  WORDS: 'lingopet_words',
  PET: 'lingopet_pet_v2',
  STATS: 'lingopet_stats',
};

const getTodayStr = () => new Date().toISOString().split('T')[0];

export const getWords = (): WordEntry[] => {
  const data = localStorage.getItem(KEYS.WORDS);
  const words: WordEntry[] = data ? JSON.parse(data) : [];
  // Ensure reviewCount exists for legacy data
  return words.map(w => ({ ...w, reviewCount: w.reviewCount || 0 }));
};

export const saveWord = (newWord: WordEntry) => {
  const words = getWords();
  const existingIndex = words.findIndex(w => w.word.toLowerCase() === newWord.word.toLowerCase());
  if (existingIndex >= 0) {
    words[existingIndex] = { ...words[existingIndex], ...newWord, id: words[existingIndex].id };
  } else {
    words.push({ ...newWord, reviewCount: 0 }); // Initialize count
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
      if (!parsed.imageUrls) parsed.imageUrls = {};
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
      const slimPet = { ...pet, imageUrls: {} };
      localStorage.setItem(KEYS.PET, JSON.stringify(slimPet));
  }
};

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
