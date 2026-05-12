# Setup and Operations

## Requirements

- Bun `1.2.16` or newer within the `1.2.x` line
- A terminal environment that can run Bun workspaces

## Installation

```bash
bun install
```

## Environment

Create a local environment file from the example values:

```bash
cp .env.example .env.local
```

### Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `MINA_API_PORT` | Bun API port | `3001` |
| `MINA_ALLOWED_ORIGIN` | CORS origin for the API | `http://localhost:3000` |
| `MINA_DATABASE_URL` | PostgreSQL URL for the future Drizzle-backed API adapter | `postgres://postgres:postgres@localhost:5432/mina` |
| `VITE_API_BASE_URL` | Browser-visible API base URL | `/` |

## Development

Run both the API and the web app:

```bash
bun run dev
```

### Endpoints

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Health: `http://localhost:3001/api/health`

## Quality Commands

### Type Checking

```bash
bun run typecheck
```

### Tests

```bash
bun run test
```

### Production Build

```bash
bun run build
```

### Full Verification

```bash
bun run check
```

## Operational Notes

1. The web app proxies `/api/*` to the local Bun API during development.
2. In production, set `VITE_API_BASE_URL` to the deployed API origin if the frontend and backend are split.
3. The API uses an in-memory repository for the posts module, so data resets when the process restarts.
4. The task/workflow core also uses in-memory repositories for now; `apps/api/src/db/schema.ts` defines the PostgreSQL schema that persistent repositories should use next.
