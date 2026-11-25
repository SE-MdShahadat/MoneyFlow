# Scripts

## `MoneyFlow_SqlServer.sql` — the whole database for SQL Server / Azure SQL

A single script that creates the complete MoneyFlow database on **SQL Server 2016 SP1+ or Azure SQL Database**:
tables, constraints, indexes, views, functions, procedures, triggers, Row-Level Security (family isolation) and the
`moneyflow_app` role. It mirrors the live Supabase database
(`supabase/schema.sql` + `002_dues.sql` + `003_projects.sql` + `004_families.sql`).

**It is kept up to date:** every change to the Supabase database is made here too, in the same commit.

It contains structure and rules only, **no family data**. Family data is private and is not stored in this repository.

### Publish to Azure SQL

1. Create an Azure SQL Database (any tier; Basic is enough to start).
2. Run the script on the **empty** database with SSMS, Azure Data Studio or sqlcmd (it uses `GO` batches):

   ```
   sqlcmd -S <server>.database.windows.net -d <database> -U <admin> -P <password> -I -f 65001 -i Scripts/MoneyFlow_SqlServer.sql
   ```

   `-f 65001` reads the file as UTF-8 so the Bangla category names arrive intact. The script refuses to run on a
   database that already has MoneyFlow tables.
3. Create the API's database user and put it in the app role:

   ```sql
   CREATE USER moneyflow_api WITH PASSWORD = '<strong password>';
   ALTER ROLE moneyflow_app ADD MEMBER moneyflow_api;
   ```

### What an Azure version of the app needs

Today the Angular app talks to Supabase directly from the browser. SQL Server cannot be reached from a browser, so a
small API (for example ASP.NET Core on Azure App Service) has to sit in between:

- **Sign-up:** hash the password, then `EXEC dbo.sign_up` (new family, or join with `@invite_code`; `dbo.check_invite`
  checks a code first).
- **Sign-in:** `EXEC dbo.find_login @email`, verify the hash, issue a token.
- **Every request:** after checking the token, run `EXEC dbo.begin_request @user_id = ...` on the connection. From then
  on Row-Level Security limits every query to that person's family and rights, exactly like the Supabase policies.
- **Same queries as now:** `dbo.list_transactions`, `dbo.transaction_summary(...)`, `dbo.filtered_transactions(...)`,
  `dbo.balance_summary()`, `dbo.dashboard` (returns the same JSON), and the views `account_balances`,
  `transaction_details`, `project_totals`.
- Errors come back with the same codes (`LAST_ADMIN`, `CATEGORY_REQUIRED`, `INVALID_INVITE`, `INVALID_REFERENCE`,
  `FORBIDDEN`), so the existing translations still apply. One difference: a write blocked by Row-Level Security raises
  an error here, where Supabase silently changed 0 rows.

### Moving the data later

Export each table from Supabase (Table Editor → Export CSV, or `pg_dump --data-only`) and import in this order:
`families`, `profiles`, `accounts`, `categories`, `projects`, `transactions`, `dues`, using
`SET IDENTITY_INSERT ... ON` to keep the ids. Supabase passwords cannot be exported in a usable form, so people set a
new password on first sign-in.

## `tests/MoneyFlow_SqlServer_Test.sql`

Checks family isolation and member/admin rights (34 checks; each line should start with `PASS`). Run it on a **fresh
test database** right after the main script, never on the real one, because it creates test families:

```
sqlcmd -S <server> -d <test database> -E -I -f 65001 -W -i Scripts/tests/MoneyFlow_SqlServer_Test.sql
```
