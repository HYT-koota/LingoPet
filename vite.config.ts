import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Injects the API_KEY from Vercel environment variables into the client-side code
      // Note: This exposes the key in the bundle, which is expected for this client-side demo structure.
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});