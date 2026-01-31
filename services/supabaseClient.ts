import { createClient } from '@supabase/supabase-js';

// 从环境变量读取 Supabase 配置
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 检查配置
console.log('%c Supabase 配置 %c', 'background:#3ECF8B;color:white;padding:2px 5px;border-radius:3px', '');
console.log('-> URL:', supabaseUrl ? '✅ 已配置' : '❌ 未配置');
console.log('-> Anon Key:', supabaseAnonKey ? '✅ 已配置' : '❌ 未配置');
