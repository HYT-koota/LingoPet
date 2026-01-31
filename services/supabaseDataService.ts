import { supabase } from './supabaseClient';
import { PetState, PetStage, WordEntry, DailyStats } from '../types';

// ========== 单词操作 ==========
export const getWords = async (): Promise<WordEntry[]> => {
  const { data, error } = await supabase
    .from('words')
    .select('*')
    .order('added_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(w => ({
    id: w.id,
    word: w.word,
    definition: w.definition,
    translation: w.translation,
    context: w.context,
    visualDescription: w.visual_description,
    addedAt: new Date(w.added_at).getTime(),
    lastReviewedAt: w.last_reviewed_at ? new Date(w.last_reviewed_at).getTime() : null,
    reviewLevel: w.review_level,
    reviewCount: w.review_count,
    nextReviewDate: new Date(w.next_review_date).getTime(),
    todayImage: w.image_url,
    todayImageDate: new Date().toISOString().split('T')[0], // 如果有 image_url 认为是今天生成的
  }));
};

export const saveWord = async (newWord: WordEntry) => {
  const wordData = {
    user_id: (await supabase.auth.getUser()).data.user?.id,
    word: newWord.word,
    definition: newWord.definition,
    translation: newWord.translation,
    context: newWord.context,
    visual_description: newWord.visualDescription,
    image_url: newWord.todayImage,
    added_at: new Date(newWord.addedAt).toISOString(),
    last_reviewed_at: newWord.lastReviewedAt ? new Date(newWord.lastReviewedAt).toISOString() : null,
    review_level: newWord.reviewLevel,
    review_count: newWord.reviewCount || 0,
    next_review_date: new Date(newWord.nextReviewDate).toISOString()
  };

  // 检查是否已存在
  const { data: existing } = await supabase
    .from('words')
    .select('id')
    .ilike('word', newWord.word.toLowerCase())
    .single();

  if (existing) {
    // 更新现有单词
    const { error } = await supabase
      .from('words')
      .update(wordData)
      .eq('id', existing.id);

    if (error) throw error;
  } else {
    // 插入新单词
    const { error } = await supabase
      .from('words')
      .insert([{ ...wordData, id: newWord.id }]);

    if (error) throw error;
  }
};

export const updateWord = async (id: string, updates: Partial<WordEntry>) => {
  const updateData: any = {};
  if (updates.todayImage !== undefined) updateData.image_url = updates.todayImage;
  if (updates.reviewLevel !== undefined) updateData.review_level = updates.reviewLevel;
  if (updates.lastReviewedAt !== undefined) updateData.last_reviewed_at = updates.lastReviewedAt ? new Date(updates.lastReviewedAt).toISOString() : null;
  if (updates.reviewCount !== undefined) updateData.review_count = updates.reviewCount;
  if (updates.nextReviewDate !== undefined) updateData.next_review_date = new Date(updates.nextReviewDate).toISOString();

  const { error } = await supabase
    .from('words')
    .update(updateData)
    .eq('id', id);

  if (error) throw error;
};

// ========== 宠物操作 ==========
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

export const getPetState = async (): Promise<PetState> => {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return INITIAL_PET;

  const { data, error } = await supabase
    .from('pet_states')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // 创建初始宠物
    await savePetState(INITIAL_PET);
    return INITIAL_PET;
  }

  return {
    name: data.name,
    stage: data.stage,
    xp: data.xp,
    cycle: data.cycle,
    mood: data.mood as any,
    lastInteraction: new Date(data.last_interaction).getTime(),
    dailyQuote: data.daily_quote,
    dailyQuoteDate: data.daily_quote_date || '',
    isTraveling: data.is_traveling,
    travelReturnTime: data.travel_return_time ? new Date(data.travel_return_time).getTime() : undefined,
    postcardCollection: data.postcard_collection || [],
    imageUrls: data.image_urls || {}
  };
};

export const savePetState = async (pet: PetState) => {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return;

  const petData = {
    user_id: userId,
    cycle: pet.cycle,
    stage: pet.stage,
    xp: pet.xp,
    name: pet.name,
    mood: pet.mood,
    last_interaction: new Date(pet.lastInteraction).toISOString(),
    daily_quote: pet.dailyQuote,
    daily_quote_date: pet.dailyQuoteDate,
    is_traveling: pet.isTraveling,
    travel_return_time: pet.travelReturnTime ? new Date(pet.travelReturnTime).toISOString() : null,
    postcard_collection: pet.postcardCollection,
    image_urls: pet.imageUrls,
    updated_at: new Date().toISOString()
  };

  // 检查是否已存在
  const { data: existing } = await supabase
    .from('pet_states')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('pet_states')
      .update(petData)
      .eq('id', existing.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('pet_states')
      .insert([petData]);

    if (error) throw error;
  }
};

// ========== 每日统计操作 ==========
export const getDailyStats = async (): Promise<DailyStats> => {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) {
    return { date: new Date().toISOString().split('T')[0], wordsAdded: 0, reviewSessionDone: false };
  }

  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (error || !data) {
    return { date: today, wordsAdded: 0, reviewSessionDone: false };
  }

  return {
    date: data.date,
    wordsAdded: data.words_added,
    reviewSessionDone: data.review_session_done
  };
};

export const updateDailyStats = async (updates: Partial<DailyStats>) => {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return;

  const today = new Date().toISOString().split('T')[0];
  const current = await getDailyStats();
  const updated = { ...current, ...updates };

  const statsData = {
    user_id: userId,
    date: today,
    words_added: updated.wordsAdded,
    review_session_done: updated.reviewSessionDone
  };

  // 检查是否已存在
  const { data: existing } = await supabase
    .from('daily_stats')
    .select('id')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('daily_stats')
      .update(statsData)
      .eq('id', existing.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('daily_stats')
      .insert([statsData]);

    if (error) throw error;
  }
};

// ========== 间隔计算 ==========
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
