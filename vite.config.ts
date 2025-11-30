import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Inject Environment Variables safely into the client bundle
      // Text Configuration
      'process.env.TEXT_API_KEY': JSON.stringify(env.TEXT_API_KEY || env.API_KEY || ''),
      'process.env.TEXT_API_BASE_URL': JSON.stringify(env.TEXT_API_BASE_URL || env.API_BASE_URL || 'https://api.openai.com/v1'),
      'process.env.TEXT_API_MODEL': JSON.stringify(env.TEXT_API_MODEL || env.API_MODEL || 'gpt-3.5-turbo'),
      
      // Image Configuration
      'process.env.IMAGE_API_KEY': JSON.stringify(env.IMAGE_API_KEY || env.API_KEY || ''),
      'process.env.IMAGE_API_BASE_URL': JSON.stringify(env.IMAGE_API_BASE_URL || env.API_BASE_URL || 'https://api.openai.com/v1'),
      'process.env.IMAGE_API_MODEL': JSON.stringify(env.IMAGE_API_MODEL || 'dall-e-3')
    }
  };
});