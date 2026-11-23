# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MoneyFlow is a family finance tracker (income, expense, transfers between accounts, dues, projects and reports; bills, loans and budgets are planned). One family per Supabase project. The UI is bilingual (Bangla default, English toggle) and responsive: bottom tab bar + FAB on phones, sidebar on screens ≥900px. It must stay usable from any network on Android and laptop with free hosting only.

## Architecture

- `frontend/`: Angular 20 (standalone components, signals, **zoneless**, hash routing), plain SCSS, no UI library. Deployed to GitHub Pages by `.github/workflows/deploy-pages.yml` on push to `main` (https://se-mdshahadat.github.io/MoneyFlow/).
- `supabase/schema.sql` + numbered follow-ups (`002_dues.sql`, …, run in order on a new project): the whole backend. Tables, Row Level Security policies, triggers, views and RPC functions on Supabase (PostgreSQL). There is no custom server; the browser talks to Supabase directly with `@supabase/supabase-js`.
- `frontend/public/config.js`: Supabase URL + publishable key, read at runtime (no rebuild to switch projects). The publishable key is public by design; security comes from RLS.

## Commands

```bash
cd frontend
npm start            # dev server on :4200 against the configured Supabase project
npx ng build         # production build into frontend/dist/frontend/browser
```

No automated tests exist yet. Schema changes: edit `supabase/schema.sql` and apply the change in the Supabase SQL Editor (there is no migration tool; write additive `alter`/`create or replace` statements for an existing project).

## Data and security model

- Sign-up is open; a trigger on `auth.users` creates a `profiles` row. The first profile becomes the active Admin; later ones are inactive until an admin approves them (`is_active`). `is_member()` / `is_admin()` gate every policy.
- Admin manages accounts, categories, members; Members read everything, add entries, edit/delete only their own (`created_by`, set by trigger). A trigger refuses to remove the last active admin.
- RLS-blocked updates/deletes affect 0 rows without an error, so `ApiService` asks for the changed ids back (`changedOne`) and turns 0 into `FORBIDDEN`.
- Account balances are computed in the `account_balances` view, never stored. Transfers have no category. Deleting an account/category that has entries only deactivates it (FK error 23503 → set `is_active = false`).
- `dues` holds Receivable (owed to the family) / Payable (owed by the family) amounts per person; settled rows are not counted. `balance_summary()` returns account total, open receivable/payable and actual = balance + receivable − payable (shown on the Transactions page).
- Projects (`003_projects.sql`, `pages/projects`): an entry (not a transfer) may carry a `project_id` plus optional `quantity`/`unit`, so a job like house construction is totalled apart (per item = category, per month, against an optional budget) while the money still moves through the normal accounts. `project_totals` view gives the totals; the list functions take an optional `p_project`. A project with entries cannot be deleted (`PROJECT_IN_USE`), only marked done.
- Reports (`pages/reports`): date-range list, date-wise, month-wise and year-wise summaries, built in the browser from `filtered_transactions` (read in pages of 1000) plus an opening balance. Excel export uses the dependency-free writer in `core/xlsx.ts`; PDF export uses the browser's print dialog ("Save as PDF") with print styles in `styles.scss`, because browser PDF libraries cannot shape Bangla text.
- DB columns are snake_case; `core/mappers.ts` converts to the camelCase models. The `dashboard` RPC returns camelCase JSON directly (except `recent`, which is mapped).

## Conventions

- Errors are translated by code: Postgres trigger messages (`LAST_ADMIN`, `CATEGORY_REQUIRED`), Supabase Auth `code`s (`invalid_credentials`, …) and app `AppError` codes all map to `err.<code>` keys in `core/i18n/translations.ts`. Add both `en` and `bn` strings for any new key.
- Templates use the `t`, `money`, `bdate`, `num` pipes (impure, so they react to the language signal).
- Supabase Auth setting "Confirm email" is turned off for this project; sign-up returns a session immediately.

## Repository notes

- Branches: `main` (default, deploys to Pages), `qc`, and `dev_shahadat` (working branch). All are tracked on `origin`.
- License: GPL-3.0. Any dependency added must be GPL-compatible (current ones are MIT).
- On this Windows machine, `git` is not on the PowerShell `PATH`; use the full path `C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe`.
