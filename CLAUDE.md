# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MoneyFlow is a family finance tracker (income, expense, transfers between accounts; bills, loans, budgets and reports are planned). One family per installation. UI is bilingual (Bangla default, English toggle) and responsive: bottom tab bar + FAB on phones, sidebar on screens ≥900px.

## Layout

- `backend/` — ASP.NET Core 9 Web API (`MoneyFlow.Api`), EF Core 9 + SQL Server, JWT auth, BCrypt passwords.
- `frontend/` — Angular 20 (standalone components, signals, **zoneless**, hash routing), plain SCSS, no UI library.
- The production Angular build is copied into `backend/MoneyFlow.Api/wwwroot` (git-ignored), so one `dotnet run` serves UI + API on port 5080.

## Commands

```bash
# Backend (from backend/)
dotnet build MoneyFlow.sln
dotnet run --project MoneyFlow.Api                              # http://0.0.0.0:5080, applies migrations on startup
dotnet ef migrations add <Name> --project MoneyFlow.Api -o Data/Migrations   # dotnet-ef is a local tool (.config/dotnet-tools.json)

# Frontend (from frontend/)
npm start            # ng serve on :4200, proxies /api to :5080 (proxy.conf.json)
npm run build:api    # production build + copy into backend wwwroot
```

No automated tests exist yet. `.claude/launch.json` has `moneyflow-api-test`, which runs the API on :5081 against a throwaway `MoneyFlow_Test` database — use it for manual/browser testing so the real `MoneyFlow` DB is not touched (the first-run admin setup can only happen once per DB).

## Configuration

- Connection string: `ConnectionStrings:MoneyFlowDb` in `appsettings.json`, overridable with env var `ConnectionStrings__MoneyFlowDb`. Only the SQL Server provider is wired up.
- JWT key: `Jwt:Key` if set (≥32 chars); otherwise auto-generated once into `App_Data/jwt.key` (git-ignored).
- `Cors:Origins` only matters when the UI is served from another origin.
- Frontend API address is read at runtime from `frontend/public/config.js` (`apiUrl`, empty = same origin), so a static host such as GitHub Pages can point at a remote API without rebuilding.

## Conventions

- Enums travel as strings in JSON and are stored as strings in the DB.
- API errors return `{ code, message }`; the frontend translates `err.<code>` keys (`core/i18n/translations.ts`). Add both `en` and `bn` strings for any new key.
- Account balances are computed (opening balance + transaction flows), never stored. Transfers move money between accounts and have no category.
- Deleting an account/category that has transactions only deactivates it.
- Roles: `Admin` manages accounts, categories and members; `Member` can add entries and edit/delete only their own. The API refuses to remove the last active admin.
- Templates use the `t`, `money`, `bdate`, `num` pipes (impure, so they react to the language signal).

## Repository notes

- Branches: `main` (default, PR target), `qc`, and `dev_shahadat` (working branch). All are tracked on `origin`.
- License: GPL-3.0. Any dependency added must be GPL-compatible (current ones are MIT).
- On this Windows machine, `git` is not on the PowerShell `PATH`, so git commands need the full path to the executable or a shell that has git available.
