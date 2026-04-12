import { createClient } from '@supabase/supabase-js';

const supabaseUrl = ((import.meta as any).env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = ((import.meta as any).env.VITE_SUPABASE_ANON_KEY || '').trim();

export const SUPABASE_CONFIG = {
  url: supabaseUrl,
  hasUrl: Boolean(supabaseUrl),
  hasAnonKey: Boolean(supabaseAnonKey),
  isConfigured: Boolean(supabaseUrl && supabaseAnonKey),
};

const DEFAULT_SUPABASE_REQUEST_TIMEOUT = 5000;
const AUTH_SUPABASE_REQUEST_TIMEOUT = 12000;

// Avoid hard crash when env vars are missing, and let UI show a clear config error state.
const safeSupabaseUrl = SUPABASE_CONFIG.isConfigured ? supabaseUrl : 'https://placeholder.supabase.co';
const safeSupabaseAnonKey = SUPABASE_CONFIG.isConfigured ? supabaseAnonKey : 'placeholder-anon-key';

export const supabase = createClient(safeSupabaseUrl, safeSupabaseAnonKey, {
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
      const urlString = typeof url === 'string' ? url : String(url);
      const timeoutMs = urlString.includes('/auth/v1/') ? AUTH_SUPABASE_REQUEST_TIMEOUT : DEFAULT_SUPABASE_REQUEST_TIMEOUT;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`[Supabase] Request timeout after ${timeoutMs}ms:`, url);
        controller.abort();
      }, timeoutMs);

      return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
    },
  },
});

console.log('%c Supabase Config %c', 'background:#3ECF8B;color:white;padding:2px 5px;border-radius:3px', '');
console.log('-> URL:', SUPABASE_CONFIG.hasUrl ? 'READY' : 'MISSING', supabaseUrl || '(empty)');
console.log('-> Anon Key:', SUPABASE_CONFIG.hasAnonKey ? 'READY' : 'MISSING');

if (!SUPABASE_CONFIG.isConfigured) {
  console.error(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. App will show config error page until env vars are set.'
  );
}
