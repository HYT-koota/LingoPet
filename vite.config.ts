
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 加载当前环境的所有变量
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // 这里的 process.env 会在前端代码中被替换为具体的字符串
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      
      'process.env.TEXT_API_KEY': JSON.stringify(env.TEXT_API_KEY || ''),
      'process.env.TEXT_API_MODEL': JSON.stringify(env.TEXT_API_MODEL || ''),
      'process.env.TEXT_API_BASE_URL': JSON.stringify(env.TEXT_API_BASE_URL || ''),

      'process.env.IMAGE_API_KEY': JSON.stringify(env.IMAGE_API_KEY || ''),
      'process.env.IMAGE_API_MODEL': JSON.stringify(env.IMAGE_API_MODEL || 'seedream-4-0-250828'),
      'process.env.IMAGE_API_BASE_URL': JSON.stringify(env.IMAGE_API_BASE_URL || '')
    }
  };
});
