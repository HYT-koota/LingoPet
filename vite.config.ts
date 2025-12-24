
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      
      // 核心：补全文本模型的环境变量注入
      'process.env.TEXT_API_KEY': JSON.stringify(env.TEXT_API_KEY || ''),
      'process.env.TEXT_API_MODEL': JSON.stringify(env.TEXT_API_MODEL || ''),
      'process.env.TEXT_API_BASE_URL': JSON.stringify(env.TEXT_API_BASE_URL || ''),

      // 图像模型
      'process.env.IMAGE_API_KEY': JSON.stringify(env.IMAGE_API_KEY || ''),
      'process.env.IMAGE_API_MODEL': JSON.stringify(env.IMAGE_API_MODEL || 'seedream-4-0-250828'),
      'process.env.IMAGE_API_BASE_URL': JSON.stringify(env.IMAGE_API_BASE_URL || '')
    }
  };
});
