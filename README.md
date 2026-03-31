# Deepmint

> Follow people who are provably good.

Deepmint turns market opinions into measurable, audited track records. Every prediction timestamped. Every outcome measured.

## Tech Stack

- **Monorepo**: Turborepo + pnpm
- **Frontend**: Next.js 15 (App Router) + Tailwind CSS 4 + shadcn/ui
- **API**: tRPC v11
- **Database**: PostgreSQL 16 + Drizzle ORM
- **Cache**: Redis 7
- **Auth**: Clerk (Google, Facebook, X, email)
- **Workers**: Inngest

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker Desktop

### Setup

```bash
# Install dependencies
pnpm install

# Start local Postgres + Redis
docker compose up -d

# Copy env file and fill in values
cp .env.example .env

# Generate and run database migrations
pnpm --filter @deepmint/db db:generate
pnpm --filter @deepmint/db db:migrate

# Seed development data
pnpm --filter @deepmint/db db:seed

# Start dev servers
pnpm dev
```

### Project Structure

```
apps/
  web/          — Next.js 15 frontend
  worker/       — Background job handlers (Inngest)
packages/
  db/           — Drizzle ORM schema, migrations, queries
  api/          — tRPC v11 routers
  scoring/      — Pure scoring functions
  ingestion/    — Source fetching and extraction
  shared/       — Types, constants, utilities
tooling/
  tsconfig/     — Shared TypeScript configs
  eslint/       — Shared ESLint config
```
