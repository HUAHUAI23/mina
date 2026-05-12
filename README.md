# Mina

Mina is a Bun + Hono full-stack monorepo built around typed contracts, layered API modules, and a React client that consumes the API through a typed Hono RPC client.

## Workspace Layout

```text
.
├── apps
│   ├── api
│   └── web
├── docs
├── packages
│   ├── contracts
│   └── typescript-config
├── bunfig.toml
├── package.json
├── tsconfig.json
└── turbo.json
```

## Quick Start

```bash
bun install
cp .env.example .env.local
bun run dev
```

## Commands

```bash
bun run dev
bun run typecheck
bun run test
bun run build
bun run check
```

## Documentation

- [Architecture](./docs/architecture.md)
- [Audit Report](./docs/audit-report-2026-03.md)
- [Development Standards](./docs/development-standards.md)
- [Setup and Operations](./docs/setup-and-operations.md)
