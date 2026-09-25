# Repository Guidelines

## Project Structure & Module Organization

This repository is a small Node.js ESM tool. `index.js` contains the Hamkaran client and CLI, `server.js` exposes the local HTTP interface, `spreadsheet.js` validates and reads Excel uploads, and `public/index.html` is the browser UI. `package-lock.json` must remain committed for reproducible installs. Keep vendor-call logic out of the UI and route it through the local server.

## Build, Test, and Development Commands

- `npm ci` installs the exact dependency versions recorded in the lockfile.
- `npm run call -- 09123456789 09198765432` runs the CLI for one or more destination numbers.
- `npm start` serves the local UI at `http://127.0.0.1:3005`.
- `npm test` runs the built-in Node.js test suite without contacting Hamkaran.
- `node index.js` displays usage information without sending a call.

There is no compilation step, formatter, or linter. Do not document or rely on one until it is added to `package.json`.

## Coding Style & Naming Conventions

Use modern JavaScript with ESM imports and four-space indentation, matching `index.js`. Prefer semicolons and consistent spacing in new or touched code. Use `camelCase` for functions and local variables (`sendBatch`), and `UPPER_SNAKE_CASE` for constants and environment-backed configuration (`MAX_CONCURRENT`). Keep API interaction isolated in small async functions, and handle rejected requests and non-JSON responses explicitly.

## Testing Guidelines

Tests use the built-in `node:test` runner; no coverage target is configured. Name tests `*.test.js` and keep external HTTP calls mocked. Tests must never contact Hamkaran or submit real calls. Add focused tests for validation, concurrency, and vendor response handling when those paths change.

## Commit & Pull Request Guidelines

The history contains only one descriptive, lowercase commit, so no formal convention is established. Use short imperative subjects, for example `handle API request timeout`. Pull requests should explain behavior changes, list verification commands, identify configuration changes, and include sanitized sample output when CLI messaging changes. Link the relevant issue when one exists.

## Security & Configuration

Set `HAMKARAN_API_KEY`, `HAMKARAN_SRC`, and `HAMKARAN_AUDIO_ID` in the environment. Never commit credentials, phone numbers, API responses, or `.env` files. Treat destination numbers and vendor identifiers as sensitive; redact them from logs, fixtures, screenshots, and review notes.
