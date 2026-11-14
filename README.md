# MoneyFlow

Family income & expense tracker. Works like a mobile app on Android and like a dashboard on a laptop, from any network. Bangla / English.

**Open the app:** https://se-mdshahadat.github.io/MoneyFlow/

## How it is built (all free)

| Part | Where |
|---|---|
| Source code | This GitHub repository |
| Web app (Angular) | GitHub Pages, deployed automatically on every push to `main` |
| Database + login | [Supabase](https://supabase.com) (PostgreSQL), free plan |

Nothing needs to run on your own computer.

## Using it

1. Open the link above. The **first** person to tap *Create account* becomes the admin.
2. Family members open the same link and tap *Create account*. The admin approves them under **Family**.
3. On Android: Chrome menu ⋮ → **Add to Home screen**, so it opens like an app.

## Database

- Schema, security rules and default categories: [`supabase/schema.sql`](supabase/schema.sql) (run once in Supabase → SQL Editor on a new project).
- See the data: Supabase dashboard → **Table Editor** or **SQL Editor**.
- Connection string for other tools: Supabase dashboard → **Connect**.
- Supabase's free plan pauses a project after about a week with no use; open the dashboard and press *Restore* if that happens.

### Move to another Supabase project

1. Create the project and run `supabase/schema.sql` in its SQL Editor.
2. In Authentication → Sign In / Providers → Email, turn **Confirm email** off.
3. Put the new project URL and publishable key in [`frontend/public/config.js`](frontend/public/config.js) and push to `main`.

## Development

```bash
cd frontend
npm install
npm start        # http://localhost:4200, uses the Supabase project from public/config.js
```

## License

GPL-3.0
