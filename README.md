<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1OUp6mUePBedokruaOvSQFPBS7w5gKKW6

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create `.env.local` file with your API keys (see below)
3. Run the app:
   `npm run dev`

## Environment Variables

Create a `.env.local` file in the project root:

```bash
# Text API (DeepSeek or Zhipu AI - OpenAI compatible)
TEXT_API_KEY=your_text_api_key_here
TEXT_API_BASE_URL=https://api.deepseek.com
TEXT_API_MODEL=deepseek-chat

# Image API (SiliconFlow - OpenAI compatible)
IMAGE_API_KEY=your_image_api_key_here
IMAGE_API_BASE_URL=https://api.siliconflow.cn/v1
IMAGE_API_MODEL=stabilityai/stable-diffusion-3-5b
```

### Alternative Text API Options

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

### Alternative Image API Options

**Qwen Image (default):**
```bash
IMAGE_API_MODEL=Qwen/Qwen-Image
IMAGE_API_BASE_URL=https://api.siliconflow.cn/v1
```

SiliconFlow also supports other models:
- `black-forest-labs/FLUX.1-dev`
- `black-forest-labs/FLUX.1-schnell`

See [SiliconFlow Docs](https://docs.siliconflow.cn/cn/userguide/capabilities/images) for more models.

## Deploy to Vercel

1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy
