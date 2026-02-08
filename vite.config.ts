import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 加载环境变量，支持 .env.local 等
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    // 同时支持 process.env 和 import.meta.env
    define: {
      'process.env.TEXT_API_KEY': JSON.stringify(env.VITE_TEXT_API_KEY || ''),
      'process.env.TEXT_API_MODEL': JSON.stringify(env.VITE_TEXT_API_MODEL || 'deepseek-chat'),
      'process.env.TEXT_API_BASE_URL': JSON.stringify(env.VITE_TEXT_API_BASE_URL || 'https://api.deepseek.com'),
      'process.env.IMAGE_API_KEY': JSON.stringify(env.VITE_IMAGE_API_KEY || ''),
      'process.env.IMAGE_API_MODEL': JSON.stringify(env.VITE_IMAGE_API_MODEL || 'Qwen/Qwen-Image'),
      'process.env.IMAGE_API_BASE_URL': JSON.stringify(env.VITE_IMAGE_API_BASE_URL || 'https://api.siliconflow.cn/v1'),
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || '')
    }
  };
});
