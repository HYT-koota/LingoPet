# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LingoPet is a React-based gamified language learning application. Users learn vocabulary through a spaced repetition system while raising a virtual pet that evolves based on learning progress. The app integrates AI services for text generation (dictionary definitions, pet reactions) and image generation (word cards, pet sprites, postcards).

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development server (Vite)
npm run build        # Build for production (TypeScript check + Vite build)
npm run preview      # Preview production build
```

## Architecture

### Tech Stack
- **Frontend**: React 18.2.0 with TypeScript, Vite 5.2.0
- **Styling**: Tailwind CSS 3.4.3 with custom color palette (brand/yellow, teal, coral)
- **Icons**: Lucide React
- **AI Services**: OpenAI-compatible text API, SiliconFlow/OpenAI-compatible image API

### State Management & Data Flow

The app uses localStorage exclusively for persistence (no external database). The main data flows are:

1. **Navigation**: `App.tsx` uses `AppMode` enum to switch views (HOME, DICTIONARY, REVIEW, PET_PROFILE, NOTEBOOK)
2. **Pet System**: Learning activities add XP to pet → XP thresholds trigger evolution → New pet images generated via AI
3. **Spaced Repetition**: Words stored with `reviewLevel` (0-5) and `nextReviewDate`. `calculateNextReview()` uses intervals [1, 3, 7, 14, 30] days

### Key Services

- **`services/storageService.ts`**: LocalStorage wrapper for words, pet state, and daily stats
- **`services/apiService.ts`**: AI integration layer with OpenAI-compatible APIs

### Environment Variables

Required in `.env.local`:

```bash
# Text API (DeepSeek/Zhipu AI - OpenAI compatible)
TEXT_API_KEY=xxx
TEXT_API_BASE_URL=https://api.deepseek.com
TEXT_API_MODEL=deepseek-chat

# Image API (SiliconFlow - OpenAI compatible)
IMAGE_API_KEY=xxx
IMAGE_API_BASE_URL=https://api.siliconflow.cn/v1
IMAGE_API_MODEL=stabilityai/stable-diffusion-3-5b
```

### Pet Lifecycle

```
Egg (0 XP) → Baby (>100 XP) → Teen (>500 XP) → Adult (>1500 XP) → Departed
                              ↓
                         Travel (Teen+ only, 1-minute demo)
```

- Teen and Adult pets can "travel" and return with postcards
- Adult pets can start a "New Generation" - creates new egg, keeps postcard collection

### Review System

Two review modes:
1. **Daily Review (passive)**: Reviews words added today
2. **Brain Gym (active)**: Reviews words due via spaced repetition (or random words for demo)

### TypeScript Configuration

- Strict mode enabled
- `noUnusedLocals` and `noUnusedParameters` disabled
- Bundler module resolution

### File Structure

```
LingoPet/
├── App.tsx              # Main app with routing logic, pet state management
├── types.ts             # All TypeScript definitions (AppMode, PetStage, WordEntry, etc.)
├── components/
│   ├── Dictionary.tsx   # Word lookup with speech recognition
│   ├── PetNode.tsx      # Pet display component
│   ├── PetProfile.tsx   # Pet details + links to Notebook
│   ├── ReviewSession.tsx # Spaced repetition review
│   └── Notebook.tsx     # Word list management
└── services/
    ├── storageService.ts # LocalStorage CRUD + spaced repetition logic
    └── apiService.ts    # AI API wrappers (OpenAI compatible text/image)
```

### API Integration

The app uses OpenAI-compatible APIs that support CORS, so no Vercel rewrites are needed:

- **Text API**: DeepSeek or Zhipu AI via `callOpenAITextAPI()`
- **Image API**: SiliconFlow via `callImageAPI()` (direct URL return, no async polling)

### Deployment

The app is designed for Vercel deployment. Environment variables must be set in Vercel's dashboard. No API proxy rewrites needed since all APIs support CORS.

### Important Notes

- The app runs entirely in the browser; all AI calls are made directly from the client
- Image generation returns direct URLs (SiliconFlow), not base64
- Placeholders (SVG data URIs) are generated as fallbacks when AI calls fail
- Custom animations (bounce, float, wiggle, pop) are defined in `index.css`
