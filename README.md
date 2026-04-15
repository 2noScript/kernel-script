# ts-lib-boilerplate

TypeScript library boilerplate with Bun.

## Installation

```bash
bun install
```

## Scripts

| Script            | Description                    |
| ----------------- | ------------------------------ |
| `bun run dev`     | Run dev mode with hot reload   |
| `bun run build`   | Build to `dist/` folder        |
| `bun run lint`    | ESLint code check              |
| `bun run format`  | Prettier code format           |
| `bun run release` | Build + bump version + git tag |

## Project Structure

```
src/           # Source code
dist/          # Build output (gitignored)
.github/      # GitHub Actions
```

## Dev Mode

Run dev mode with hot reload:

```bash
bun run dev
```

Automatically restarts when files change.

## Release

### How It Works

Workflow triggers when pushing a branch named `release/*`:

```bash
# Create release branch
git checkout -b release/v1.0.0

# ...make code changes, commit...
git push origin release/v1.0.0

# → GitHub Actions runs:
# 1. Install dependencies
# 2. Run lint
# 3. Build
# 4. Create GitHub Release + npm publish

# Merge to main when done
git checkout main
git merge release/v1.0.0
git push origin main

# Delete local branch
git branch -D release/v1.0.0
```

### GitHub Actions Workflow

File: `.github/workflows/release.yml`

Trigger: Push branch `release/*`

Steps:

1. Checkout code
2. Setup Bun
3. Install dependencies
4. Run lint
5. Build
6. Bump version + git tag + push

## Configuration

| File                  | Purpose                  |
| --------------------- | ------------------------ |
| `tsconfig.json`       | TypeScript dev config    |
| `tsconfig.build.json` | TypeScript build config  |
| `eslint.config.js`    | ESLint v9 flat config    |
| `.prettierrc`         | Prettier formatting      |
| `package.json`        | Scripts and dependencies |
