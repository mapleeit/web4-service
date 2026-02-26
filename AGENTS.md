# AGENTS.md

## Cursor Cloud specific instructions

**Stack:** Node.js + Express + TypeScript. Dev server uses `tsx watch` for hot reload.

**Quick reference (see `package.json` scripts for full list):**
- Lint: `npm run lint`
- Test: `npm test`
- Dev server: `npm run dev` (runs on port 3000 by default, override with `PORT` env var)
- Build: `npm run build`

**Notes:**
- The dev server (`npm run dev`) uses `tsx watch` which auto-reloads on file changes in `src/`.
- ESLint uses flat config (`eslint.config.mjs`) with TypeScript support via `typescript-eslint`.
- Jest is configured via `jest.config.js` with `ts-jest` preset; test files live alongside source as `*.test.ts`.
