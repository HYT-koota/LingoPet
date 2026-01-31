import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Text API (DeepSeek/Zhipu AI)
      'process.env.TEXT_API_KEY': JSON.stringify(env.TEXT_API_KEY || ''),
      'process.env.TEXT_API_MODEL': JSON.stringify(env.TEXT_API_MODEL || 'deepseek-chat'),
      'process.env.TEXT_API_BASE_URL': JSON.stringify(env.TEXT_API_BASE_URL || 'https://api.deepseek.com'),

      // Image API (SiliconFlow)
      'process.env.IMAGE_API_KEY': JSON.stringify(env.IMAGE_API_KEY || ''),
      'process.env.IMAGE_API_MODEL': JSON.stringify(env.IMAGE_API_MODEL || 'Qwen/Qwen-Image'),
      'process.env.IMAGE_API_BASE_URL': JSON.stringify(env.IMAGE_API_BASE_URL || 'https://api.siliconflow.cn/v1'),

      // Supabase
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || '')
    }
  };
});
