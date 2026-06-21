# OneVideo Studio MVP

AI-native short video generation OS. This MVP is designed to run locally first, then be upgraded with real providers such as OneAI, Kling, Runway, Luma, TTS and FFmpeg rendering.

## What is included

- Next.js app
- Project creation page
- Project dashboard
- Project detail page
- Prisma PostgreSQL schema
- Demo user and credit account
- Script Agent
- Storyboard Agent
- OneAI-compatible client
- Mock video provider output
- BullMQ Redis workflow queue
- Background project worker
- Scene timeline
- Asset records
- Model task records
- Docker Compose PostgreSQL
- Docker Compose Redis

## Requirements

- Node.js 20+
- pnpm
- Docker Desktop

## Quick start

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:generate
pnpm db:push
pnpm dev
```

Open:

```bash
http://localhost:3000
```

Run the background worker in a second terminal:

```bash
pnpm worker
```

## Optional seed

```bash
pnpm seed
```

Then open `/dashboard/projects`.

## OneAI mode

By default, the project runs with mock AI output:

```env
MOCK_AI="true"
```

To connect your OneAI endpoint:

```env
MOCK_AI="false"
ONEAI_BASE_URL="https://oneai-saas-web-production.up.railway.app"
ONEAI_API_KEY="your_api_key"
```

The client calls:

```text
/v1/chat/completions
```

and expects OpenAI-compatible output.

## Current MVP flow

```text
Create Project
→ Queue Project Workflow
→ Worker Generates Script
→ Worker Generates Storyboard
→ Worker Creates Scenes
→ Worker Generates / Polls Scene Videos
→ Worker Creates Mock Audio / Subtitle Asset Records
→ Worker Marks Project Completed
```

## v0.4 async generation

Project creation is now asynchronous:

```text
Next.js API
→ Create Project
→ Add BullMQ job
→ Return projectId immediately
→ Project Worker runs the long generation workflow
→ Project detail page polls /api/projects/:projectId/status
```

This keeps real Kling generation out of the request lifecycle, so browser requests no longer wait on long text-to-video polling.

Required local services:

```bash
docker compose up -d
pnpm db:push
pnpm dev
pnpm worker
```

The worker now consumes three queues:

```text
project workflow queue → script + storyboard + scene creation
scene video queue      → one Kling clip per scene, retryable per scene
render queue           → TTS voiceover + FFmpeg final MP4
```

For Kling mode:

```env
MOCK_AI="false"
VIDEO_PROVIDER="kling"
VIDEO_PROVIDER_FALLBACK_TO_MOCK="false"
KLING_API_KEY="your_kling_key"
KLING_MODEL="kling-v3"
KLING_MODE="pro"
VIDEO_PROVIDER_USE_IMAGE_TO_VIDEO="false"
KLING_IMAGE_TO_VIDEO_PATH="/v1/videos/image2video"
KLING_IMAGE_FIELD="image_url"
KLING_SCENE_MAX_SECONDS="10"
```

Use `KLING_MODE="pro"` for better detail and motion quality. Switch it back to
`std` when you want cheaper drafts.

Set `VIDEO_PROVIDER_USE_IMAGE_TO_VIDEO="true"` only after generated reference
images are reachable by the video provider, for example through a public app URL
or cloud storage. Local `localhost` image URLs are usually not reachable by
external provider APIs.

## v0.4.1 Kling multi-scene clips

Kling text-to-video clips are generated as scene clips instead of one long request:

```text
15s → 10s + 5s
30s → 10s + 10s + 10s
45s → 10s + 10s + 10s + 10s + 5s
60s → 10s + 10s + 10s + 10s + 10s + 10s
```

The project detail page shows every generated scene clip. When all clips complete, the render worker can stitch them into a final MP4 with voiceover.

Storyboard prompts now include a project-level visual bible: same protagonist,
wardrobe, props, lighting, camera language and scene-to-scene entry/exit states.
This helps independent Kling scene jobs feel like one continuous story instead
of unrelated stock clips.

## v0.5 Director Engine

The v0.5 flow adds five production-oriented layers:

```text
visual bible
→ reference image + scene first-frame assets
→ optional image-to-video provider route
→ automatic scene quality score/review status
→ subtitle, cover and title-card packaging assets
```

Quality review can remain advisory or block rendering:

```env
VIDEO_QUALITY_MIN_SCORE="70"
VIDEO_QUALITY_BLOCK_RENDER="false"
```

## v0.6 image-to-video production path

The v0.6 upgrade adds the production control layer on top of the Director
Engine:

```text
real image provider
→ public storage URL
→ provider create job
→ delayed provider poll jobs
→ extracted QA frame
→ auto retry or manual approve
```

Image generation defaults to placeholders so local demos still work:

```env
IMAGE_PROVIDER="placeholder"
IMAGE_PROVIDER_FALLBACK_TO_PLACEHOLDER="true"
IMAGE_BASE_URL="https://api.openai.com"
IMAGE_API_KEY=""
IMAGE_MODEL="gpt-image-1"
IMAGE_SIZE="1024x1536"
```

Set `IMAGE_PROVIDER="openai"` after adding a compatible image API key. Generated
images are saved locally first, then passed through the storage adapter.

Storage defaults to local files. Use a public base URL or an HTTP PUT upload
adapter before enabling image-to-video:

```env
STORAGE_PROVIDER="local"
STORAGE_PUBLIC_BASE_URL=""
STORAGE_UPLOAD_BASE_URL=""
STORAGE_UPLOAD_TOKEN=""
PUBLIC_ASSET_BASE_URL=""
ALLOW_LOCAL_PROVIDER_ASSETS="false"
```

Provider task splitting is enabled by default:

```env
PROVIDER_TASK_SPLIT="true"
PROVIDER_POLL_ATTEMPTS="60"
PROVIDER_POLL_INTERVAL_MS="10000"
```

Scene QA extracts an actual video frame and can retry low-quality scenes:

```env
VIDEO_QA_EXTRACT_FRAME="true"
VIDEO_QUALITY_AUTO_RETRY="false"
VIDEO_QUALITY_AUTO_RETRY_LIMIT="1"
```

Only turn on image-to-video after the first-frame URLs are publicly reachable:

```env
VIDEO_PROVIDER_USE_IMAGE_TO_VIDEO="true"
```

Kling failures are treated as real failures by default. If a Kling task times out or returns no video URL, the scene and project are marked failed so the user can retry instead of silently mixing mock footage into a real project.

For local demos only, set:

```env
VIDEO_PROVIDER_FALLBACK_TO_MOCK="true"
```

## v0.4.2 scene retry, TTS and render

Each scene clip is generated as a separate queue job. If Scene 5 fails, retry only Scene 5 from the project detail page.

When all scene clips complete, OneVideo enqueues a render job:

```text
scene clips
→ generate voiceover audio
→ FFmpeg concat clips
→ mux voiceover
→ final MP4
```

Local macOS voiceover uses the system `say` command by default:

```env
TTS_PROVIDER="system"
SYSTEM_TTS_VOICE=""
```

OpenAI-compatible TTS can be enabled with:

```env
TTS_PROVIDER="openai"
OPENAI_API_KEY="your_key"
OPENAI_TTS_MODEL="gpt-4o-mini-tts"
OPENAI_TTS_VOICE="alloy"
```

FFmpeg is required for final MP4 rendering and for local system TTS audio conversion:

```env
FFMPEG_PATH="ffmpeg"
```

If FFmpeg is not available, the project stays at `completed_clips` and shows a render error instead of pretending a final video exists.

## Next upgrade path

1. Split provider create and provider poll into separate queue jobs.
2. Add subtitle generator with SRT/ASS timing.
3. Add real provider routers: Kling, Runway, Luma.
4. Add cloud storage for generated clips/audio/final MP4.
5. Add Stripe and credit ledger charging.
6. Add Cloudflare R2/S3 storage.
7. Add Stripe and credit ledger charging.
8. Add template system and brand kit.

## Suggested real production architecture

```text
Next.js Web
→ Project API
→ BullMQ Workflow
→ OneAI Agents
→ Video Provider Router
→ TTS Provider Router
→ FFmpeg Renderer
→ R2 Storage
→ Final MP4
```

## Important files

```text
app/create/page.tsx                    Create UI
app/api/projects/route.ts              Project API
app/dashboard/projects/page.tsx        Project list
app/dashboard/projects/[projectId]     Project detail
lib/oneai.ts                           OneAI client + agents
lib/workflow.ts                        MVP workflow engine
prisma/schema.prisma                   Database schema
```

## Notes

This is a runnable MVP skeleton. It intentionally uses mock media URLs so you can validate the product flow first without paying video-generation costs.
