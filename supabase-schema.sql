-- LingoPet 数据库表结构
-- 在 Supabase SQL Editor 中执行此脚本

-- 1. 单词表
CREATE TABLE IF NOT EXISTS words (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    definition TEXT NOT NULL,
    translation TEXT,
    context TEXT NOT NULL,
    visual_description TEXT,
    image_url TEXT,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_reviewed_at TIMESTAMP WITH TIME ZONE,
    review_level INTEGER DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    next_review_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 宠物状态表
CREATE TABLE IF NOT EXISTS pet_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    cycle INTEGER DEFAULT 1,
    stage INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 0,
    name TEXT DEFAULT 'Pika',
    mood TEXT DEFAULT 'sleepy',
    last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    daily_quote TEXT DEFAULT 'Zzz... (I\'m waiting to be born!)',
    daily_quote_date TEXT,
    is_traveling BOOLEAN DEFAULT FALSE,
    travel_return_time TIMESTAMP WITH TIME ZONE,
    postcard_collection JSONB DEFAULT '[]'::jsonb,
    image_urls JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 每日统计表
CREATE TABLE IF NOT EXISTS daily_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    words_added INTEGER DEFAULT 0,
    review_session_done BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_words_user_id ON words(user_id);
CREATE INDEX IF NOT EXISTS idx_words_next_review ON words(next_review_date);
CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, date);

-- 启用行级安全策略 (RLS)
ALTER TABLE words ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能操作自己的数据
CREATE POLICY "Users can view their own words" ON words
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own words" ON words
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own words" ON words
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own words" ON words
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own pet" ON pet_states
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pet" ON pet_states
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pet" ON pet_states
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own stats" ON daily_stats
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own stats" ON daily_stats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stats" ON daily_stats
    FOR UPDATE USING (auth.uid() = user_id);
