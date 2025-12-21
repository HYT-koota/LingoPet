
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      
      // 关键：将 GMI 相关的环境变量显式暴露给前端
      'process.env.TEXT_API_KEY': JSON.stringify(env.TEXT_API_KEY || ''),
      'process.env.IMAGE_API_KEY': JSON.stringify(env.IMAGE_API_KEY || ''),
      'process.env.IMAGE_API_MODEL': JSON.stringify(env.IMAGE_API_MODEL || 'seedream-4-0-250828'),
      
      // 保留备用配置
      'process.env.TEXT_API_BASE_URL': JSON.stringify(env.TEXT_API_BASE_URL || ''),
      'process.env.IMAGE_API_BASE_URL': JSON.stringify(env.IMAGE_API_BASE_URL || '')
    }
  };
});
