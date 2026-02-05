import { supabase } from './supabaseClient';
import { PetState, PetStage, WordEntry, DailyStats } from '../types';

// ========== 认证辅助函数 ==========
/**
 * 带重试的 getUser 包装器
 */
const getUserWithRetry = async (maxRetries = 2): Promise<{ data: { user: any } }> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`[Auth Retry] Attempt ${i + 1}/${maxRetries} calling supabase.auth.getUser()`);
      const startTime = Date.now();
      const result = await supabase.auth.getUser();
      const elapsed = Date.now() - startTime;
      console.log(`[Auth Retry] Attempt ${i + 1} completed in ${elapsed}ms, user:`, result.data.user ? '✅ Present' : '❌ None');

      if (result.data.user) return result;

      if (i < maxRetries - 1) {
        const delay = 1000 * (i + 1);
        console.log(`[Auth Retry] No user found, waiting ${delay}ms before retry...`);
        await new Promise(r => setTimeout(r, delay));
      }
    } catch (error) {
      console.error(`[Auth Retry] Attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) throw error;
    }
  }
  throw new Error('Auth failed after retries');
};

/**
 * 认证健康检查
 */
export const checkAuthHealth = async () => {
  const start = Date.now();
  try {
    const result = await supabase.auth.getUser();
    const elapsed = Date.now() - start;
    console.log(`[Auth Health] getUser() took ${elapsed}ms`);
    return { healthy: elapsed < 2000, user: result.data.user, elapsed };
  } catch (error) {
    console.error('[Auth Health] Error:', error);
    return { healthy: false, error, elapsed: Date.now() - start };
  }
};

/**
 * 执行追踪包装器
 */
const withTrace = <T extends any[], R>(fn: (...args: T) => Promise<R>, name: string) => async (...args: T): Promise<R> => {
  console.log(`[Trace] ${name} started`);
  const start = Date.now();
  try {
    const result = await fn(...args);
    console.log(`[Trace] ${name} completed in ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.error(`[Trace] ${name} failed in ${Date.now() - start}ms:`, error);
    throw error;
  }
};

/**
 * 调试数据库访问
 */
export const debugDatabaseAccess = async () => {
  console.log('[DB Debug] Starting database access debug...');
  try {
    const userResult = await getUserWithRetry();
    console.log('[DB Debug] User ID:', userResult.data.user?.id);

    // Test simple query
    const test = await supabase
      .from('words')
      .select('count(*)', { count: 'exact', head: true })
      .limit(1);
    console.log('[DB Debug] Test query result:', test);

    // Test pet_states table
    const petTest = await supabase
      .from('pet_states')
      .select('count(*)', { count: 'exact', head: true })
      .limit(1);
    console.log('[DB Debug] Pet test query result:', petTest);

    return { success: !test.error && !petTest.error, test, petTest };
  } catch (error) {
    console.error('[DB Debug] Error:', error);
    return { success: false, error };
  }
};

// ========== 单词操作 ==========
export const getWords = async (): Promise<WordEntry[]> => {
  console.log('[getWords] Starting getWords function');
  const authStartTime = Date.now();
  let userResult;
  try {
    console.log('[getWords] Calling supabase.auth.getUser() with retry...');
    userResult = await getUserWithRetry();
    console.log(`[getWords] supabase.auth.getUser() completed in ${Date.now() - authStartTime}ms`);
  } catch (authError) {
    console.error('[getWords] Error in supabase.auth.getUser():', authError);
    throw authError;
  }

  const userId = userResult.data.user?.id;
  console.log('[getWords] Auth result:', userResult);
  console.log('[getWords] User ID:', userId, 'User:', userResult.data.user);

  let query = supabase
    .from('words')
    .select('*')
    .order('added_at', { ascending: false });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getWords] Error fetching words:', error);
    throw error;
  }

  console.log('[getWords] Retrieved words count:', data?.length || 0);
  const words = (data || []).map(w => ({
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

  console.log('[getWords] Mapped words:', words.map(w => ({ word: w.word, addedAt: w.addedAt, reviewLevel: w.reviewLevel })));
  return words;
};

export const saveWord = async (newWord: WordEntry) => {
  console.log('[saveWord] Starting function for word:', newWord.word);
  try {
    console.log('[saveWord] Calling supabase.auth.getUser() with retry...');
    const authStartTime = Date.now();
    const userResult = await getUserWithRetry();
    console.log(`[saveWord] supabase.auth.getUser() completed in ${Date.now() - authStartTime}ms`);
    console.log('[saveWord] Auth result:', userResult);
    const userId = userResult.data.user?.id;
    console.log('[saveWord] User ID:', userId, 'User:', userResult.data.user, 'Word:', newWord.word);

  if (!userId) {
    console.error('[saveWord] No user ID found, cannot save word');
    throw new Error('User not authenticated');
  }

  const wordData = {
    user_id: userId,
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

  // 检查是否已存在（基于user_id和word）
  const { data: existing, error: checkError } = await supabase
    .from('words')
    .select('id')
    .eq('user_id', userId)
    .ilike('word', newWord.word.toLowerCase())
    .maybeSingle();

  if (checkError) {
    console.error('[saveWord] Error checking existing word:', checkError);
    throw checkError;
  }

  if (existing) {
    // 更新现有单词
    console.log('[saveWord] Updating existing word:', existing.id);
    const { error } = await supabase
      .from('words')
      .update(wordData)
      .eq('id', existing.id);

    if (error) {
      console.error('[saveWord] Error updating word:', error);
      throw error;
    }
    console.log('[saveWord] Word updated successfully');
  } else {
    // 插入新单词
    console.log('[saveWord] Inserting new word with ID:', newWord.id);
    const { error } = await supabase
      .from('words')
      .insert([{ ...wordData, id: newWord.id }]);

    if (error) {
      console.error('[saveWord] Error inserting word:', error);
      throw error;
    }
    console.log('[saveWord] Word inserted successfully');
  }
  } catch (error) {
    console.error('[saveWord] Error in saveWord function:', error);
    throw error;
  }
};

export const updateWord = async (id: string, updates: Partial<WordEntry>) => {
  console.log('[updateWord] Updating word ID:', id, 'with updates:', updates);

  const updateData: any = {};
  if (updates.todayImage !== undefined) updateData.image_url = updates.todayImage;
  if (updates.reviewLevel !== undefined) updateData.review_level = updates.reviewLevel;
  if (updates.lastReviewedAt !== undefined) updateData.last_reviewed_at = updates.lastReviewedAt ? new Date(updates.lastReviewedAt).toISOString() : null;
  if (updates.reviewCount !== undefined) updateData.review_count = updates.reviewCount;
  if (updates.nextReviewDate !== undefined) updateData.next_review_date = new Date(updates.nextReviewDate).toISOString();

  console.log('[updateWord] Update data:', updateData);

  const { error } = await supabase
    .from('words')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error('[updateWord] Error updating word:', error);
    throw error;
  }

  console.log('[updateWord] Word updated successfully');
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
  console.log('[getPetState] Calling supabase.auth.getUser() with retry...');
  const authStartTime = Date.now();
  const userResult = await getUserWithRetry();
  console.log(`[getPetState] supabase.auth.getUser() completed in ${Date.now() - authStartTime}ms`);
  const userId = userResult.data.user?.id;
  console.log('[getPetState] User ID:', userId);

  if (!userId) {
    console.log('[getPetState] No user ID, returning INITIAL_PET');
    return INITIAL_PET;
  }

  const { data, error } = await supabase
    .from('pet_states')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[getPetState] Error fetching pet:', error);
    // 创建初始宠物
    await savePetState(INITIAL_PET);
    return INITIAL_PET;
  }

  if (!data) {
    console.log('[getPetState] No pet found, creating INITIAL_PET');
    // 创建初始宠物
    await savePetState(INITIAL_PET);
    return INITIAL_PET;
  }

  console.log('[getPetState] Pet data retrieved:', {
    name: data.name,
    stage: data.stage,
    xp: data.xp,
    imageUrls: data.image_urls
  });

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
  console.log('[savePetState] Calling supabase.auth.getUser() with retry...');
  const authStartTime = Date.now();
  const userResult = await getUserWithRetry();
  console.log(`[savePetState] supabase.auth.getUser() completed in ${Date.now() - authStartTime}ms`);
  const userId = userResult.data.user?.id;
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

  const { error } = await supabase
    .from('pet_states')
    .upsert(petData, { onConflict: 'user_id' });

  if (error) throw error;
};

// ========== 每日统计操作 ==========
export const getDailyStats = async (): Promise<DailyStats> => {
  console.log('[getDailyStats] Calling supabase.auth.getUser() with retry...');
  const authStartTime = Date.now();
  const userResult = await getUserWithRetry();
  console.log(`[getDailyStats] supabase.auth.getUser() completed in ${Date.now() - authStartTime}ms`);
  const userId = userResult.data.user?.id;
  console.log('[getDailyStats] User ID:', userId);

  if (!userId) {
    console.log('[getDailyStats] No user ID, returning default stats');
    return { date: new Date().toISOString().split('T')[0], wordsAdded: 0, reviewSessionDone: false };
  }

  const today = new Date().toISOString().split('T')[0];
  console.log('[getDailyStats] Today:', today);

  const { data, error } = await supabase
    .from('daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (error) {
    console.error('[getDailyStats] Error fetching stats:', error);
    return { date: today, wordsAdded: 0, reviewSessionDone: false };
  }

  if (!data) {
    console.log('[getDailyStats] No stats found for today, returning default');
    return { date: today, wordsAdded: 0, reviewSessionDone: false };
  }

  console.log('[getDailyStats] Stats retrieved:', data);
  return {
    date: data.date,
    wordsAdded: data.words_added,
    reviewSessionDone: data.review_session_done
  };
};

export const updateDailyStats = async (updates: Partial<DailyStats>) => {
  console.log('[updateDailyStats] Calling supabase.auth.getUser() with retry...');
  const authStartTime = Date.now();
  const userResult = await getUserWithRetry();
  console.log(`[updateDailyStats] supabase.auth.getUser() completed in ${Date.now() - authStartTime}ms`);
  const userId = userResult.data.user?.id;
  console.log('[updateDailyStats] User ID:', userId, 'Updates:', updates);

  if (!userId) {
    console.warn('[updateDailyStats] No user ID, skipping update');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  console.log('[updateDailyStats] Today:', today);
  const current = await getDailyStats();
  console.log('[updateDailyStats] Current stats:', current);
  const updated = { ...current, ...updates };
  console.log('[updateDailyStats] Updated stats:', updated);

  const statsData = {
    user_id: userId,
    date: today,
    words_added: updated.wordsAdded,
    review_session_done: updated.reviewSessionDone
  };

  console.log('[updateDailyStats] Stats data to upsert:', statsData);

  const { error } = await supabase
    .from('daily_stats')
    .upsert(statsData, { onConflict: 'user_id,date' });

  if (error) {
    console.error('[updateDailyStats] Error upserting stats:', error);
    throw error;
  }

  console.log('[updateDailyStats] Stats updated successfully');
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
