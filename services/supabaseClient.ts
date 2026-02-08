import { createClient } from '@supabase/supabase-js';

// 从环境变量读取 Supabase 配置
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

// 创建可配置超时的 Supabase 客户端
// 全局超时设置为较短时间（5秒），因为认证操作需要快速响应
const SUPABASE_REQUEST_TIMEOUT = 5000;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      'X-Client-Info': 'lingopet-web',
    },
    fetch: (url, options) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`[Supabase] Request timeout after ${SUPABASE_REQUEST_TIMEOUT}ms:`, url);
        controller.abort();
      }, SUPABASE_REQUEST_TIMEOUT);
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
    }
  },
});

// 检查配置
console.log('%c Supabase 配置 %c', 'background:#3ECF8B;color:white;padding:2px 5px;border-radius:3px', '');
console.log('-> URL:', supabaseUrl ? '✅ 已配置' : '❌ 未配置', supabaseUrl);
console.log('-> Anon Key:', supabaseAnonKey ? '✅ 已配置' : '❌ 未配置');

// 调试日志 - 移除无效的实时订阅
console.log('[Supabase Client] 客户端已初始化');

// 监听认证状态变化
supabase.auth.onAuthStateChange((event, session) => {
  console.log('[Supabase Auth] Auth state changed:', event, 'Session exists:', !!session);
});

// 全局错误处理
supabase.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.error('[Supabase Auth] Session error:', error);
  } else {
    console.log('[Supabase Auth] Current session:', data.session ? '✅ Present' : '❌ None');
  }
});

// 添加网络请求拦截器（通过 fetch 包装）- 仅在浏览器环境中
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [resource, config] = args;
    const url = typeof resource === 'string' ? resource : (resource as Request).url;

    // 只拦截 Supabase 请求
    if (url?.includes('supabase.co')) {
      const requestId = Math.random().toString(36).substring(7);
      const logData: any = {
        url,
        method: config?.method || 'GET',
        headers: config?.headers,
      };

      // 安全地解析请求体
      if (config?.body) {
        try {
          logData.body = JSON.parse(config.body as string);
        } catch {
          logData.body = '(非JSON或无法解析)';
        }
      }

      console.log(`[Supabase Network] Request ${requestId}:`, logData);

      const startTime = Date.now();
      try {
        const response = await originalFetch.apply(this, args);
        const endTime = Date.now();
        const clone = response.clone();
        const text = await clone.text();
        console.log(`[Supabase Network] Response ${requestId}:`, {
          status: response.status,
          statusText: response.statusText,
          time: `${endTime - startTime}ms`,
          body: text.substring(0, 500) + (text.length > 500 ? '...' : '')
        });
        return response;
      } catch (error) {
        console.error(`[Supabase Network] Error ${requestId}:`, error);
        throw error;
      }
    }

    return originalFetch.apply(this, args);
  };
  console.log('[Supabase Client] 网络请求调试已启用');
}

console.log('[Supabase Client] 调试模式已启用');
