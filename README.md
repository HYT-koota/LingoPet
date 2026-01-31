<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# LingoPet - AI-Powered Language Learning with a Virtual Pet

Learn vocabulary through spaced repetition while raising a virtual pet that evolves based on your progress.

## Features

- 📚 **Dictionary** - AI-powered word lookup with definitions, translations, and examples
- 🐣 **Virtual Pet** - Grows and evolves as you learn
- 📝 **Spaced Repetition** - Optimize learning with interval-based reviews
- ✈️ **Travel System** - Pet travels and collects postcards
- 🔄 **Cloud Sync** - Data saved to Supabase, accessible from any device
- 🎨 **AI Images** - Unique images for words, pets, and postcards

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create `.env.local` file with your API keys (see below)
3. Run app:
   `npm run dev`

## Environment Variables

Create a `.env.local` file in project root:

```bash
# === Supabase (Required for cloud sync) ===
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# === Text API (DeepSeek or Zhipu AI) ===
TEXT_API_KEY=your_text_api_key_here
TEXT_API_BASE_URL=https://api.deepseek.com
TEXT_API_MODEL=deepseek-chat

# === Image API (SiliconFlow) ===
IMAGE_API_KEY=your_image_api_key_here
IMAGE_API_BASE_URL=https://api.siliconflow.cn/v1
IMAGE_API_MODEL=Qwen/Qwen-Image
```

## Setting Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. In the SQL Editor, run the script from `supabase-schema.sql`
4. Go to Project Settings > API to get your URL and Anon Key

## Alternative Text API Options

**DeepSeek:**
```bash
TEXT_API_BASE_URL=https://api.deepseek.com
TEXT_API_MODEL=deepseek-chat
```

**Zhipu AI (智谱):**
```bash
TEXT_API_BASE_URL=https://open.bigmodel.cn/api/paas
TEXT_API_MODEL=glm-4
```

## Alternative Image API Options

**Qwen Image (default):**
```bash
IMAGE_API_MODEL=Qwen/Qwen-Image
IMAGE_API_BASE_URL=https://api.siliconflow.cn/v1
```

SiliconFlow also supports:
- `black-forest-labs/FLUX.1-dev`
- `black-forest-labs/FLUX.1-schnell`

See [SiliconFlow Docs](https://docs.siliconflow.cn/cn/userguide/capabilities/images) for more models.

## Deploy to Vercel

1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard (same as .env.local)
4. Deploy

**Important:** After deployment, go to Supabase Dashboard > Authentication > URL Configuration and add your Vercel app URL to the redirect allowlist.

## Development Commands

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run preview    # Preview production build
```
