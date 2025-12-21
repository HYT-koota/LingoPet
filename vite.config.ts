
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // The API key must be obtained exclusively from process.env.API_KEY
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      
      // Fallbacks for legacy configurations
      'process.env.TEXT_API_KEY': JSON.stringify(env.API_KEY || env.TEXT_API_KEY || ''),
      'process.env.TEXT_API_BASE_URL': JSON.stringify(env.TEXT_API_BASE_URL || env.API_BASE_URL || 'https://api.openai.com/v1'),
      'process.env.TEXT_API_MODEL': JSON.stringify(env.TEXT_API_MODEL || env.API_MODEL || 'gemini-3-flash-preview'),
      
      'process.env.IMAGE_API_KEY': JSON.stringify(env.API_KEY || env.IMAGE_API_KEY || ''),
      'process.env.IMAGE_API_BASE_URL': JSON.stringify(env.IMAGE_API_BASE_URL || env.API_BASE_URL || 'https://api.openai.com/v1'),
      'process.env.IMAGE_API_MODEL': JSON.stringify(env.IMAGE_API_MODEL || 'gemini-2.5-flash-image')
    }
  };
});
