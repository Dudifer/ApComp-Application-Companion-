# ApComp — The Application Companion

> A full-stack job application tracking and resume tailoring tool for software engineers.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [Roadmap](#roadmap)

---

## Overview

ApComp is a developer-focused job application companion that automates the busywork of job hunting. It scrapes your Gmail for application emails, recommends relevant jobs from multiple sources, parses your CV into a structured skill profile, and provides a drag-and-drop resume builder with live PDF preview and keyword-based tailoring.

---

## Architecture

![ApComp monorepo architecture](docs/images/architecture.svg)

---

## Features

### 1. Application Tracking (Gmail Scraping)

![Gmail scraping pipeline](docs/images/gmail-scraping.svg)

**Auto-reject rule:** Applications with no status update for 60 days are automatically marked `REJECTED`.

---

### 2. CV Parsing Pipeline

![CV parsing pipeline](docs/images/cv-pipeline.svg)

---

### 3. Resume Builder

![Resume builder flow](docs/images/resume-builder.svg)

---

### 4. Job Recommendation Engine

![Job recommendation pipeline](docs/images/job-pipeline.svg)

**Source weighting:** Dismissals update source weights so sources you dismiss from more get queried less.

| Weight | Formula |
|--------|---------|
| Initial | adzuna: 0.5, jsearch: 0.5 |
| After dismissals | `score = 1 - (dismissals / total)`, normalized |

---

### 5. Job-Based Resume Tailoring 

When viewing a job, clicking "✦ Tailor resume" navigates to the resume builder with keyword-based trimming applied automatically — no AI required.
'''
Job description + requirements
    │
    ▼
Extract keywords
    ├── job.tags
    ├── highlights.qualifications
    ├── highlights.responsibilities
    └── description (first 2000 chars)
    │
    ▼
Score each resume item
    ├── Experience entries  → keywords in title + company + bullets
    └── Projects           → keywords in name + category + techStack + bullets
    │
    ▼
Sort by score descending (most relevant first)
    │
    ▼
estimateChars(state) > PAGE_CHAR_LIMIT (3200)?
    ├── No  → return as-is (already fits one page)
    └── Yes → hide lowest-scoring projects until fits
    │
    ▼
Show in builder with tailoring banner
    └── "X items hidden · ranked by keyword relevance"
    └── "Reset to full CV" button
'''
Key design decisions:
- No AI used pure keyword frequency scoring
- Experience entries are never hidden, only reordered by relevance
- User retains full manual control — anything hidden can be toggled back
- Export filename includes the target company: Jacob_Nyberg_Resume_Stripe.pdf

---

### 6. Contact Discovery (Hunter.io)

Per job card, on-demand to preserve free tier quota:

```
Click "Find contact"
    │
    ├── Cache hit  → return instantly (no credits used)
    └── Cache miss → Hunter.io domain search
                         │
                         ├── Email pattern (e.g. {first}.{last}@stripe.com)
                         ├── Up to 5 contacts with confidence scores
                         └── LinkedIn links where available
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 19 + Vite 8 | UI framework |
| Styling | Inline CSS with CSS variables | Theming |
| Drag & Drop | @dnd-kit/core | Resume builder |
| PDF | @react-pdf/renderer | Live preview + export |
| Backend | NestJS 11 | REST API framework |
| Database | PostgreSQL 16 (Docker) | Persistence |
| ORM | Prisma 6 | Type-safe DB access |
| HTTP Client | Axios | External API calls |
| AI | Anthropic Claude Sonnet | CV extraction, job filtering |
| Monorepo | Turborepo + pnpm workspaces | Build orchestration |
| Types | Shared @apcomp/types package | Cross-app type safety |

### External APIs

| API | Purpose | Free Tier |
|-----|---------|-----------|
| Adzuna | Job listings | 250 calls/month |
| JSearch (RapidAPI) | Job listings | 200 calls/month |
| Clearbit Autocomplete | Company domain lookup | Unlimited |
| Hunter.io | Contact email discovery | 25 searches/month |
| Gmail OAuth2 | Email scraping | Free |
| Anthropic Claude | CV parsing, job scoring | Pay per token |

---

## Project Structure

```
apcomp/
├── apps/
│   ├── web/                      # React frontend
│   │   └── src/
│   │       ├── components/
│   │       │   ├── JobDetailPanel.tsx
│   │       │   └── ResumePdfTemplate.tsx
│   │       ├── hooks/
│   │       │   ├── useApplications.ts
│   │       │   ├── useJobs.ts
│   │       │   ├── useResumeBuilder.ts
│   │       │   ├── resumeUtils.ts
│   │       │   └── resumeTailor.ts
│   │       ├── pages/
│   │       │   ├── AllApplicationsPage.tsx
│   │       │   ├── JobSearchPage.tsx
│   │       │   ├── ResumeBuilderPage.tsx
│   │       │   ├── ResumeDemoPage.tsx
│   │       │   └── ResumePage.tsx
│   │       └── App.tsx
│   │
│   ├── api/                      # NestJS backend
│   │   └── src/modules/
│   │       ├── applications/     # Gmail scraping + status detection
│   │       ├── jobs/             # Job fetch + filter + cache pipeline
│   │       └── resume/           # CV parsing + AI extraction
│   │
│   └── extension/                # Chrome extension
│       ├── content.js            # Save jobs from any page
│       ├── autofill.js           # Autofill application forms
│       └── manifest.json
│
└── packages/
    └── types/                    # Shared TypeScript types
        └── src/
            ├── job.ts
            ├── resume.ts
            └── index.ts
```

---

## Setup & Installation

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop

### Steps

```bash
# 1. Clone and install
git clone https://github.com/dudifer/apcomp
cd apcomp
pnpm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Build shared types
cd packages/types && pnpm build && cd ../..

# 4. Run database migrations
cd apps/api
node_modules/.bin/prisma migrate dev
node_modules/.bin/prisma generate
cd ../..

# 5. Start everything
$env:NODE_OPTIONS="--max-old-space-size=4096"   # Windows PowerShell
pnpm turbo dev
```

App runs at:
- **Frontend:** http://localhost:5173
- **API:** http://localhost:3000

### Rebuild after type changes

```powershell
cd packages/types && Remove-Item -Recurse -Force dist && pnpm build && cd ../..
cd apps/api && Remove-Item -Recurse -Force dist && npx tsc --project tsconfig.build.json && cd ../..
pnpm turbo dev
```

---

## Environment Variables

### `apps/api/.env`

```env
DATABASE_URL="postgresql://apcomp_user:apcomp_pass@localhost:5432/apcomp_db"
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/applications/gmail/callback
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
JSEARCH_API_KEY=
HUNTER_API_KEY=
DEV_USER_EMAIL=your@gmail.com
```

---

## API Reference

### Applications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/applications` | All applications |
| GET | `/applications/dashboard` | Active (non-rejected) only |
| GET | `/applications/gmail/auth` | Get OAuth URL |
| GET | `/applications/gmail/status` | Check if connected |
| GET | `/applications/gmail/callback` | OAuth callback |
| POST | `/applications/scrape` | Force re-scrape emails |

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jobs/recommended` | Get cached/fresh recommendations |
| POST | `/jobs/search` | Search with custom query |
| POST | `/jobs/refresh` | Force re-fetch recommendations |
| POST | `/jobs/dismiss` | Dismiss a job |
| GET | `/jobs/weights` | Get source weights |
| GET | `/jobs/contacts` | Find contacts at company |

### Resume

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/resume/upload` | Upload PDF/DOCX |
| GET | `/resume/profile` | Get parsed profile |
| POST | `/resume/gap-answers` | Submit gap question answers |
| DELETE | `/resume/profile` | Delete profile |

---

## Database Schema

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `User` | id, email, name | Single dev user for now |
| `CvProfile` | roles, skills, projects (JSON) | Parsed CV data |
| `Application` | company, role, status, emailDates | Gmail-scraped applications |
| `SavedJob` | jobData (JSON), expiresAt | 7-day job cache |
| `DismissedJob` | jobId, source, company | Feed weight tuning |
| `JobFeedWeights` | adzuna, jsearch (float) | Source weighting |
| `GmailTokens` | accessToken, refreshToken | OAuth persistence |

### ApplicationStatus enum

| Status | Trigger |
|--------|---------|
| SUBMITTED | "thank you for applying" |
| VIEWED | "application was viewed" |
| ASSESSMENT | "coding challenge" / "take-home" |
| PHONE_SCREEN | "phone screen" / "recruiter call" |
| INTERVIEW | "we'd like to schedule" |
| OFFER | "pleased to offer" |
| REJECTED | "unfortunately" / "moved forward with other candidates" |
| AUTO_REJECTED | No update after 60 days |

---

## Testing

```bash
# Frontend unit tests (resume parsing pipeline)
cd apps/web && pnpm test

# API parser tests (requires fixture PDF at src/__fixtures__/JNybergResume.pdf)
cd apps/api && pnpm test:parsers
```

### Test Coverage

| Suite | What it covers |
|-------|---------------|
| `resumeUtils.test.ts` | CV text → ResumeState: section isolation, header extraction, project/experience separation |
| `ResumeBuilderPage.test.tsx` | State mutations, PDF template rendering, toggle/hide behavior |
| `resume-parser.spec.ts` | PDF/DOCX bytes → raw text → what buildInitialState receives |

---

## Roadmap

- [ ] Auth (Clerk) — multi-user login
- [ ] Chrome Extension — save jobs from any page, autofill applications from CV profile
- [ ] Interview Practice — LeetCode-style coding challenges (Monaco + Judge0)
- [ ] Application analytics — pipeline funnel charts
- [ ] Mobile app