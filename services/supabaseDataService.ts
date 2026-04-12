import { supabase } from './supabaseClient';
import { PetState, PetStage, WordEntry, DailyStats } from '../types';

// ========== 认证辅助函数 ==========
type UserResult = { data: { user: any } };

const AUTH_TIMEOUT_MS = 15000;
const SESSION_FALLBACK_TIMEOUT_MS = 5000;
const BASE_DELAY_MS = 1000;
let inFlightUserRequest: Promise<UserResult> | null = null;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const getUserFromSessionFallback = async (): Promise<any | null> => {
  try {
    const { data, error } = await withTimeout(
      supabase.auth.getSession(),
      SESSION_FALLBACK_TIMEOUT_MS,
      `auth.getSession() timeout after ${SESSION_FALLBACK_TIMEOUT_MS}ms`
    );
    if (error) {
      console.warn('[Auth Retry] getSession fallback failed:', error.message);
      return null;
    }
    if (data.session?.user) {
      console.log('[Auth Retry] Using cached session user as fallback');
      return data.session.user;
    }
    return null;
  } catch (error) {
    console.warn('[Auth Retry] getSession fallback threw:', error);
    return null;
  }
};

const getUserWithRetryInternal = async (maxRetries = 3): Promise<UserResult> => {
  const cachedUser = await getUserFromSessionFallback();
  if (cachedUser) {
    console.log('[Auth Retry] Using cached session user before network retry');
    return { data: { user: cachedUser } };
  }

  for (let i = 0; i < maxRetries; i++) {
    let startTime: number | undefined;
    try {
      console.log(`[Auth Retry] Attempt ${i + 1}/${maxRetries} calling supabase.auth.getUser()`);
      startTime = Date.now();

      const result = await withTimeout(
        supabase.auth.getUser(),
        AUTH_TIMEOUT_MS,
        `auth.getUser() timeout after ${AUTH_TIMEOUT_MS}ms`
      );

      const elapsed = Date.now() - startTime;
      console.log(`[Auth Retry] Attempt ${i + 1} completed in ${elapsed}ms, user:`, result.data.user ? '✅ Present' : '❌ None');

      if (result.data.user) return result;
      const fallbackUser = await getUserFromSessionFallback();
      if (fallbackUser) return { data: { user: fallbackUser } };

      if (i < maxRetries - 1) {
        const exponentialDelay = BASE_DELAY_MS * Math.pow(2, i);
        const jitter = Math.floor(Math.random() * 501);
        const delay = exponentialDelay + jitter;

        console.log(`[Auth Retry] No user found, waiting ${delay}ms (exp:${exponentialDelay}+jitter:${jitter}) before retry ${i + 2}...`);
        await new Promise(r => setTimeout(r, delay));
      }
    } catch (error) {
      const elapsed = startTime !== undefined ? Date.now() - startTime : 0;
      console.error(`[Auth Retry] Attempt ${i + 1} failed ${startTime !== undefined ? `after ${elapsed}ms` : '(startTime not set)'}:`, error);
      const fallbackUser = await getUserFromSessionFallback();
      if (fallbackUser) return { data: { user: fallbackUser } };

      if (i === maxRetries - 1) {
        console.warn('[Auth Retry] All attempts failed, returning null user');
        return { data: { user: null } };
      }

      const exponentialDelay = BASE_DELAY_MS * Math.pow(2, i);
      const jitter = Math.floor(Math.random() * 501);
      const delay = exponentialDelay + jitter;

      console.log(`[Auth Retry] Request failed, waiting ${delay}ms (exp:${exponentialDelay}+jitter:${jitter}) before retry ${i + 2}...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.warn('[Auth Retry] Auth failed after retries, returning null user');
  return { data: { user: null } };
};

const getUserWithRetry = async (maxRetries = 3): Promise<UserResult> => {
  if (inFlightUserRequest) {
    console.log('[Auth Retry] Reusing in-flight auth request');
    return inFlightUserRequest;
  }

  inFlightUserRequest = getUserWithRetryInternal(maxRetries).finally(() => {
    inFlightUserRequest = null;
  });
  return inFlightUserRequest;
};

/**
 * 综合连接健康检查
 * 检查认证、数据库连接和响应时间
 */
export const checkAuthHealth = async () => {
  const overallStart = Date.now();
  const healthReport = {
    overallHealthy: false,
    authHealthy: false,
    dbHealthy: false,
    authLatency: 0,
    dbLatency: 0,
    user: null as any,
    errors: [] as string[],
    timestamp: new Date().toISOString()
  };

  try {
    // 1. 认证健康检查（10秒超时）
    const authStart = Date.now();
    try {
      const authResult = await Promise.race([
        supabase.auth.getUser(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('认证健康检查超时 (10000ms)')), 10000))
      ]) as any;
      healthReport.authLatency = Date.now() - authStart;
      healthReport.user = authResult.data.user;
      healthReport.authHealthy = healthReport.authLatency < 5000; // 5秒内为健康
      console.log(`[Health] 认证检查完成: ${healthReport.authLatency}ms, 用户: ${healthReport.user ? '✅' : '❌'}`);
    } catch (authError) {
      healthReport.authLatency = Date.now() - authStart;
      healthReport.errors.push(`认证失败: ${authError instanceof Error ? authError.message : String(authError)}`);
      console.error('[Health] 认证检查失败:', authError);
    }

    // 2. 数据库连接检查（15秒超时）
    const dbStart = Date.now();
    try {
      const dbResult = await Promise.race([
        supabase.from('words').select('count(*)', { count: 'exact', head: true }).limit(1),
        new Promise((_, reject) => setTimeout(() => reject(new Error('数据库健康检查超时 (15000ms)')), 15000))
      ]) as any;
      healthReport.dbLatency = Date.now() - dbStart;
      healthReport.dbHealthy = !dbResult.error && healthReport.dbLatency < 8000; // 8秒内为健康
      console.log(`[Health] 数据库检查完成: ${healthReport.dbLatency}ms, 状态: ${dbResult.error ? '❌' : '✅'}`);

      if (dbResult.error) {
        healthReport.errors.push(`数据库查询错误: ${dbResult.error.message}`);
      }
    } catch (dbError) {
      healthReport.dbLatency = Date.now() - dbStart;
      healthReport.errors.push(`数据库检查失败: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      console.error('[Health] 数据库检查失败:', dbError);
    }

    // 3. 综合健康评估
    healthReport.overallHealthy = healthReport.authHealthy && healthReport.dbHealthy;
    const totalLatency = Date.now() - overallStart;

    console.log(`[Health] 综合健康报告: ${healthReport.overallHealthy ? '✅ 健康' : '⚠️ 异常'}, 总耗时: ${totalLatency}ms`);
    console.log(`[Health] 详情: 认证${healthReport.authHealthy ? '✅' : '❌'}(${healthReport.authLatency}ms), 数据库${healthReport.dbHealthy ? '✅' : '❌'}(${healthReport.dbLatency}ms)`);
    if (healthReport.errors.length > 0) {
      console.log('[Health] 错误列表:', healthReport.errors);
    }

    return {
      ...healthReport,
      totalLatency,
      suggestions: healthReport.errors.length > 0 ? [
        '建议：检查网络连接',
        '建议：验证Supabase项目状态',
        '建议：查看控制台错误详情'
      ] : ['系统运行正常']
    };
  } catch (error) {
    const totalLatency = Date.now() - overallStart;
    console.error('[Health] 健康检查异常:', error);
    return {
      ...healthReport,
      totalLatency,
      errors: [...healthReport.errors, `全局异常: ${error instanceof Error ? error.message : String(error)}`],
      suggestions: ['严重：系统健康检查失败，请检查网络和Supabase配置']
    };
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

/**
 * 清除无效会话并重新认证
 */
export const resetAuthSession = async () => {
  console.log('[Auth Reset] Starting auth session reset...');
  try {
    // 先尝试获取当前会话
    const { data: { session } } = await supabase.auth.getSession();
    console.log('[Auth Reset] Current session:', session ? 'Present' : 'None');

    if (session) {
      // 尝试刷新令牌
      console.log('[Auth Reset] Attempting to refresh token...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('[Auth Reset] Token refresh failed:', refreshError);
      } else {
        console.log('[Auth Reset] Token refresh successful');
      }
    }

    // 清除本地存储的会话数据
    console.log('[Auth Reset] Clearing local session data...');
    localStorage.removeItem('supabase.auth.token');

    // 重新获取会话
    console.log('[Auth Reset] Getting fresh session...');
    const { data: newSession } = await supabase.auth.getSession();
    console.log('[Auth Reset] New session:', newSession.session ? 'Present' : 'None');

    return { success: true, hadSession: !!session, hasSession: !!newSession.session };
  } catch (error) {
    console.error('[Auth Reset] Error:', error);
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

  // 如果没有用户ID，返回空数组（用户未认证或认证失败）
  if (!userId) {
    console.warn('[getWords] No user ID found, returning empty array. User may not be authenticated.');
    return [];
  }

  let query = supabase
    .from('words')
    .select('*')
    .order('added_at', { ascending: false });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  // 添加数据库查询超时保护（5秒）
  let data, error;
  try {
    const queryResult = await Promise.race([
      query,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Database query timeout after 15000ms')), 15000))
    ]) as any;
    data = queryResult.data;
    error = queryResult.error;
  } catch (queryError) {
    console.error('[getWords] Database query failed with timeout:', queryError);
    throw new Error(`Database query failed: ${queryError instanceof Error ? queryError.message : 'Unknown error'}`);
  }

  if (error) {
    console.error('[getWords] Error fetching words:', error);
    throw error;
  }

  console.log('[getWords] Retrieved words count:', data?.length || 0);
  const words = (data || []).map((w: any) => ({
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

  console.log('[getWords] Mapped words:', words.map((w: WordEntry) => ({ word: w.word, addedAt: w.addedAt, reviewLevel: w.reviewLevel })));
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
  let existing, checkError;
  try {
    const checkResult = await Promise.race([
      supabase
        .from('words')
        .select('id')
        .eq('user_id', userId)
        .ilike('word', newWord.word.toLowerCase())
        .maybeSingle(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Check existing word query timeout after 15000ms')), 15000))
    ]) as any;
    existing = checkResult.data;
    checkError = checkResult.error;
  } catch (checkQueryError) {
    console.error('[saveWord] Check existing word query failed:', checkQueryError);
    throw new Error(`Check existing word failed: ${checkQueryError instanceof Error ? checkQueryError.message : 'Unknown error'}`);
  }

  if (checkError) {
    console.error('[saveWord] Error checking existing word:', checkError);
    throw checkError;
  }

  if (existing) {
    // 更新现有单词
    console.log('[saveWord] Updating existing word:', existing.id);
    let updateError;
    try {
      const updateResult = await Promise.race([
        supabase
          .from('words')
          .update(wordData)
          .eq('id', existing.id),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Update word query timeout after 15000ms')), 15000))
      ]) as any;
      updateError = updateResult.error;
    } catch (updateQueryError) {
      console.error('[saveWord] Update word query failed:', updateQueryError);
      throw new Error(`Update word failed: ${updateQueryError instanceof Error ? updateQueryError.message : 'Unknown error'}`);
    }

    if (updateError) {
      console.error('[saveWord] Error updating word:', updateError);
      throw updateError;
    }
    console.log('[saveWord] Word updated successfully');
  } else {
    // 插入新单词
    console.log('[saveWord] Inserting new word with ID:', newWord.id);
    let insertError;
    try {
      const insertResult = await Promise.race([
        supabase
          .from('words')
          .insert([{ ...wordData, id: newWord.id }]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Insert word query timeout after 15000ms')), 15000))
      ]) as any;
      insertError = insertResult.error;
    } catch (insertQueryError) {
      console.error('[saveWord] Insert word query failed:', insertQueryError);
      throw new Error(`Insert word failed: ${insertQueryError instanceof Error ? insertQueryError.message : 'Unknown error'}`);
    }

    if (insertError) {
      console.error('[saveWord] Error inserting word:', insertError);
      throw insertError;
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
  if (updates.translation !== undefined) updateData.translation = updates.translation;
  if (updates.definition !== undefined) updateData.definition = updates.definition;
  if (updates.context !== undefined) updateData.context = updates.context;
  if (updates.visualDescription !== undefined) updateData.visual_description = updates.visualDescription;
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
