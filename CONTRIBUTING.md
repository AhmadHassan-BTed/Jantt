# Contributing to Jantt

Thank you for your interest in contributing to **Jantt**! We welcome contributions of all kinds: bug fixes, performance optimizations, architectural enhancements, documentation improvements, and new features.

---

## Monorepo Architecture Overview

Jantt is structured as an npm workspaces monorepo with high cohesion and zero unnecessary coupling:

```
jantt/
├── packages/
│   ├── core/          # TypeScript Gantt engine (one runtime dependency: fflate)
│   ├── react/         # React wrapper component (<Jantt />)
│   ├── vue/           # Vue 3 wrapper component (<JanttTimeline />)
│   ├── svelte/        # Svelte action (use:janttAction)
│   ├── elements/      # Web Component (<jantt-timeline>) + self-contained browser bundle
│   ├── standalone/    # Script-tag bundles (IIFE & UMD) for vanilla HTML/JS
│   ├── yjs/           # Yjs CRDT collaboration binding
│   ├── interop/       # MS Project XML, Primavera XER, CSV, executive reports
│   ├── render-canvas/ # 2D canvas renderer for very large plans
│   └── mcp/           # Model Context Protocol server for AI agents
├── cli/               # Node.js CLI (@jantt/cli, binary `jantt`)
├── apps/
│   └── playground/    # Interactive playground (deployed to GitHub Pages)
├── worker/            # Cloudflare Worker CORS proxy for remote plans
├── python/            # Python bridge (pip install jantt)
├── schema/            # Formal JSON Schema specification (v1)
├── examples/          # Canonical, validated JSON planning fixtures
└── docs/              # Technical specifications, architecture, and guides
```

---

## Development Setup

### Prerequisites
- **Node.js**: `^22.22.2 || ^24.15.0 || >=26` for development (the Vite 8, Vitest 5 and jsdom toolchain). `.nvmrc` pins the Node 22 LTS line, so `nvm use` selects it. `.npmrc` sets `engine-strict`, so npm stops with a clear error on an unsupported version instead of installing a broken tree. The published packages run on Node.js `^20.19.0 || >=22.12.0`.
- **npm**: `v10` or higher (bundled with Node 22)
- **Python 3.11+**: only for the Python bridge tests
- **Git**

### Initial Setup
```bash
# 1. Clone your fork
git clone https://github.com/YOUR_USERNAME/Jantt.git
cd Jantt

# 2. Select the pinned Node version and install the locked dependencies
nvm use
npm ci

# 3. Build all workspace packages (required before typecheck and tests)
npm run build

# 4. Run test suites to verify local setup
npm test

# 5. Launch local interactive playground
npm run dev
```

Use `npm install` (not `npm ci`) only when you intentionally change dependencies; commit the updated `package-lock.json` with the change.

### Local Configuration
Copy `.env.example` to `.env` at the repository root to change the dev server host/port or point the playground at your own Firebase project. Every value is optional.

---

## Testing & Validation

Every pull request must pass the same checks CI runs, in this order (the typecheck and the
interop, mcp, render-canvas and cli suites consume the built `@jantt/core`):

```bash
# Compile every workspace
npm run build

# TypeScript typecheck across all packages plus a syntax check of the JavaScript CLIs
npm run lint            # `npm run typecheck` runs the TypeScript part alone

# Run all unit and integration tests across the monorepo
npm test

# Check that every published package's entry points and exports resolve
npm run check:packages

# Python bridge tests
npm run test:python
```

To work on one package in watch mode, run Vitest from that package, for example:

```bash
npm exec --workspace=@jantt/core -- vitest
```

---

## Coding & Architectural Standards

1. **Keep `@jantt/core` Lean**:
   `@jantt/core` ships exactly one runtime dependency (`fflate`, for compressed share links). Do not add another runtime dependency without discussing it in an issue first; math, date and utility code is written in-house.
2. **Pure UTC Date Math**:
   All date arithmetic must use the pure UTC helpers in `packages/core/src/date-math.ts` to prevent timezone offsets from shifting task dates.
3. **Data Immutability & Pure Functions**:
   Algorithms like `resolveSchedule`, `calculateCriticalPath`, `validate`, and `layout` must be pure and return new objects without mutating their inputs.
4. **Strong Typing & Schema Alignment**:
   Any new field added to domain models in `types.ts` must be mirrored in `schema/jantt.schema.json` and validated in `validator.ts`.
5. **Escape Plan Data**:
   Any plan-derived string placed into an `innerHTML` template must go through `escapeHtml()`; prefer `textContent` and DOM APIs in new code.
6. **Deterministic Tests**:
   Tests must not depend on the wall clock or the current date: pass explicit dates or use `vi.useFakeTimers()` / `vi.setSystemTime()`.

---

## Commit Conventions

We adhere to the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new feature or capability (e.g., `feat: add export to SVG vector`)
- `fix:` A bug fix (e.g., `fix: prevent circular dependency lockup`)
- `docs:` Documentation only changes (e.g., `docs: update architecture diagrams`)
- `refactor:` Code refactoring without behavioral change
- `perf:` Performance improvements
- `test:` Adding or updating tests
- `chore:` Build scripts, repo configuration, maintenance

---

## Pull Request Process

1. Fork the repository and create your feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Write clean, modular, and documented code with corresponding tests in `tests/`.
3. Ensure the full check sequence passes:
   ```bash
   npm run build && npm run lint && npm test
   ```
4. Commit your changes following Conventional Commits.
5. Push to your fork and submit a Pull Request describing your changes and testing approach.

Thank you for helping make Jantt the most powerful JSON Gantt engine in the world!
