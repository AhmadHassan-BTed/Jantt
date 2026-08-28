# Contributing to Jantt

Thank you for your interest in contributing to **Jantt**! We welcome contributions of all kinds: bug fixes, performance optimizations, architectural enhancements, documentation improvements, and new features.

---

## 🏛️ Monorepo Architecture Overview

Jantt is structured as an npm workspaces monorepo with high cohesion and zero unnecessary coupling:

```
jantt/
├── packages/
│   ├── core/         # Pure TypeScript Gantt engine (ZERO runtime dependencies)
│   ├── react/        # Official React wrapper component (<Jantt />)
│   └── standalone/   # Script-tag bundles (UMD & IIFE) for vanilla HTML/JS
├── cli/              # Standalone Node.js CLI runner (`npx jantt open <file>`)
├── apps/
│   └── playground/   # Split-view documentation sandbox & interactive playground
├── schema/           # Formal JSON Schema specification (v1)
├── examples/         # Canonical, validated JSON planning fixtures
└── docs/             # Technical specifications, architecture, and guides
```

---

## 🛠️ Development Setup

### Prerequisites
- **Node.js**: `v18.0.0` or higher (Node 20+ recommended)
- **npm**: `v9.0.0` or higher
- **Git**

### Initial Setup
```bash
# 1. Clone your fork
git clone https://github.com/YOUR_USERNAME/Jantt.git
cd Jantt

# 2. Install monorepo dependencies
npm install

# 3. Build all workspace packages
npm run build

# 4. Run test suites to verify local setup
npm test

# 5. Launch local interactive playground
npm run dev
```

---

## 🧪 Testing & Validation

We maintain a strict 100% test passing standard across all packages:

```bash
# Run all unit and integration tests across the monorepo
npm test

# Run tests in watch mode
npm run test:watch

# Check TypeScript types across all packages
npm run typecheck

# Run linter
npm run lint
```

---

## 📐 Coding & Architectural Standards

1. **Zero Runtime Dependencies in `@jantt/core`**:
   `@jantt/core` MUST remain 100% dependency-free. No external math, date, or utility libraries may be added to `@jantt/core`.
2. **Pure UTC Date Math**:
   All date arithmetic must use the pure UTC helpers in `packages/core/src/date-math.ts` to prevent timezone offsets from shifting task dates.
3. **Data Immutability & Pure Functions**:
   Algorithms like `resolveSchedule`, `calculateCriticalPath`, `validate`, and `layout` must be pure and return new objects without mutating their inputs.
4. **Strong Typing & Schema Alignment**:
   Any new field added to domain models in `types.ts` must be mirrored in `schema/jantt.schema.json` and validated in `validator.ts`.

---

## 📝 Commit Conventions

We adhere to the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new feature or capability (e.g., `feat: add export to SVG vector`)
- `fix:` A bug fix (e.g., `fix: prevent circular dependency lockup`)
- `docs:` Documentation only changes (e.g., `docs: update architecture diagrams`)
- `refactor:` Code refactoring without behavioral change
- `perf:` Performance improvements
- `test:` Adding or updating tests
- `chore:` Build scripts, repo configuration, maintenance

---

## 🚀 Pull Request Process

1. Fork the repository and create your feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Write clean, modular, and documented code with corresponding tests in `tests/`.
3. Ensure all tests and builds pass:
   ```bash
   npm test && npm run build
   ```
4. Commit your changes following Conventional Commits.
5. Push to your fork and submit a Pull Request describing your changes and testing approach.

Thank you for helping make Jantt the most powerful JSON Gantt engine in the world!
