# Technology Stack

**Analysis Date:** 2026-07-16

## Languages

**Primary:**
- TypeScript 5.x - Frontend (Next.js), backend (Express scanner-service), and shared types
- JavaScript - Configuration files and build scripts

**Secondary:**
- SQL - Database migrations and Supabase schema (`supabase/migrations/`, `supabase/schema.sql`)

## Runtime

**Environment:**
- Node.js 18+ - For Next.js server and Express scanner-service

**Package Manager:**
- npm (package-lock.json present for both root and `scanner-service/`)

## Frameworks

**Core:**
- Next.js 14.2.35 - App Router, server-side rendering, API routes (`package.json`, `next.config.mjs`)
- Express 4.21.0 - REST API server for scanner-service (`scanner-service/package.json`)
- React 18 - UI components

**Build/Dev:**
- TypeScript 5.x - Type checking and compilation
- PostCSS 8 - CSS processing (`postcss.config.mjs`)
- Tailwind CSS 3.4.1 - Utility-first styling (`tailwind.config.ts`)
- ESLint 8.x - Linting with Next.js config (`eslint-config-next 14.2.35`)

## Key Dependencies

**Database & Client:**
- @supabase/supabase-js 2.99.3 - PostgreSQL client and real-time subscriptions (both root and scanner-service)

**Email:**
- resend 6.9.4 - Transactional email API with webhook events (`lib/email.ts`, `app/api/webhooks/resend/route.ts`)

**Webhooks:**
- svix 1.89.0 - Webhook signature verification for Resend events (`app/api/webhooks/resend/route.ts`)

**Internationalization:**
- next-intl 4.13.0 - Multi-language support (EN, NL) for UI and email

**Accessibility & Performance Analysis:**
- lighthouse 13.1.0 - Performance, accessibility, best practices auditing (scanner-service)
- axe-core 4.10.0 - WCAG accessibility testing (scanner-service)
- @axe-core/playwright 4.10.0 - Playwright integration for axe (scanner-service)

**Browser Automation:**
- playwright 1.58.2 - Headless browser control for website scanning (scanner-service)
  - Chromium bundled and pre-installed via `mcr.microsoft.com/playwright:v1.58.2-noble` Docker base image
- chrome-launcher 1.2.1 - Chrome browser launch utility (scanner-service)

**AI Analysis:**
- @google/generative-ai 0.24.1 - Google Gemini API for AI-driven design and content analysis (scanner-service)

**Security & Middleware:**
- helmet 8.0.0 - HTTP headers security (scanner-service)
- cors 2.8.5 - Cross-Origin Resource Sharing (scanner-service)

**Environment & Utilities:**
- dotenv 17.3.1 - Environment variable loading (scanner-service)
- tsx 4.19.0 - TypeScript execution for development (`scanner-service/package.json` dev script)

## Configuration

**Environment:**
- Environment variables defined in `.env`, `.env.local` (not readable due to permissions, but referenced throughout codebase)
- Required vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `FILLOUT_WEBHOOK_SECRET`, `SCANNER_SERVICE_URL`, `SCANNER_API_KEY`, `CRON_SECRET`, `GOOGLE_API_KEY`

**Build & Deployment:**
- `vercel.json` - Vercel deployment config with cron jobs (three scheduled tasks)
- `next.config.mjs` - Next.js configuration
- `tailwind.config.ts` - Tailwind CSS customization
- `tsconfig.json` - TypeScript compiler options (strict mode, path aliases `@/*`)
- `scanner-service/railway.toml` - Railway deployment config, Docker build setup, health check configuration

**Database:**
- Supabase PostgreSQL backend
- Migrations stored in `supabase/migrations/` (9 files from Mar–Jun 2026)
- Schema covers: `scans`, `leads`, `email_events` tables with indexes and RLS policies

**Docker:**
- `scanner-service/Dockerfile` - Multi-layer build using `mcr.microsoft.com/playwright:v1.58.2-noble` base image
  - Copies shared types from `types/` into the container
  - Compiles scanner-service via `npm run build` (TypeScript → JavaScript)
  - Exposes port 3001

## Platform Requirements

**Development:**
- Node.js 18+ required
- Docker (for local scanner-service testing)

**Production:**
- Vercel - Next.js app hosting (cron jobs via Vercel Cron)
- Railway - Express scanner-service hosting
- Supabase - PostgreSQL database hosting
- Resend - Email delivery service
- Google Generative AI API - Gemini access for analysis

---

*Stack analysis: 2026-07-16*
