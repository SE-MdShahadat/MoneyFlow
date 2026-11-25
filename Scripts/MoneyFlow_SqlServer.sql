/* =====================================================================
   MoneyFlow — full database for SQL Server / Azure SQL Database
   ---------------------------------------------------------------------
   Same model as the live Supabase (PostgreSQL) database:
   supabase/schema.sql + 002_dues.sql + 003_projects.sql + 004_families.sql.
   KEEP THIS FILE IN STEP with every change to the Supabase scripts.

   How to publish
     * Run on an EMPTY database with sqlcmd, SSMS or Azure Data Studio
       (the script uses GO batch separators). It refuses to run twice.
     * Needs SQL Server 2016 SP1+ or Azure SQL Database (Row-Level Security,
       SESSION_CONTEXT, CREATE OR ALTER, JSON).
     * Structure and rules only — no family data. Moving data from Supabase
       is a separate step (export + import), see Scripts/README.md.

   How security works here (differs from Supabase)
     Supabase knows the signed-in user from its JWT. SQL Server does not, so
     the API (which checks the password / token) must start every request on
     its connection with:
         EXEC dbo.begin_request @user_id = '<profile id>';
     That stores user, family, active and admin flags in SESSION_CONTEXT
     (read-only for the rest of the connection; pooled connections are reset).
     Row-Level Security policies then show and change only that family's rows,
     exactly like the Supabase policies. Members read everything in their
     family, add entries, and edit/delete only their own; admins manage the
     rest. db_owner (maintenance, and procedures marked EXECUTE AS OWNER)
     bypasses the filters.
     The API connects as a database user in role moneyflow_app (bottom).

   Errors raised for the app (same codes as the Supabase version, map to
   err.<code> in the frontend translations):
     LAST_ADMIN, CATEGORY_REQUIRED, INVALID_INVITE, INVALID_REFERENCE,
     FORBIDDEN, PROJECT_IN_USE (FK 547 on deleting a project with entries).
   ===================================================================== */

SET NOCOUNT ON;
-- Required for the filtered index, Row-Level Security and JSON (sqlcmd turns QUOTED_IDENTIFIER off by default).
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
GO

IF OBJECT_ID(N'dbo.families', N'U') IS NOT NULL
BEGIN
  RAISERROR (N'MoneyFlow tables already exist in this database. Run this script on an empty database.', 16, 1);
  SET NOEXEC ON;
END;
GO

CREATE SCHEMA rls;
GO

/* ---------------------------------------------------------------------
   Tables
   --------------------------------------------------------------------- */
CREATE TABLE dbo.families (
  id           bigint IDENTITY(1, 1) NOT NULL CONSTRAINT pk_families PRIMARY KEY,
  name         nvarchar(100) NOT NULL CONSTRAINT ck_families_name CHECK (LEN(name) >= 1),
  -- 10 hex characters (no look-alike letters such as O/I/L).
  invite_code  varchar(20) NOT NULL
               CONSTRAINT df_families_invite DEFAULT (UPPER(LEFT(REPLACE(CONVERT(varchar(36), NEWID()), '-', ''), 10)))
               CONSTRAINT uq_families_invite UNIQUE,
  created_at   datetimeoffset(3) NOT NULL CONSTRAINT df_families_created DEFAULT (SYSDATETIMEOFFSET())
);

-- One row per person.
CREATE TABLE dbo.profiles (
  id             uniqueidentifier NOT NULL CONSTRAINT pk_profiles PRIMARY KEY CONSTRAINT df_profiles_id DEFAULT (NEWID()),
  name           nvarchar(100) NOT NULL CONSTRAINT ck_profiles_name CHECK (LEN(name) >= 1),
  email          nvarchar(320) NULL,
  relation       nvarchar(50) NULL,
  role           varchar(10) NOT NULL CONSTRAINT df_profiles_role DEFAULT ('Member')
                 CONSTRAINT ck_profiles_role CHECK (role IN ('Admin', 'Member')),
  is_active      bit NOT NULL CONSTRAINT df_profiles_active DEFAULT (0),
  family_id      bigint NOT NULL CONSTRAINT fk_profiles_family REFERENCES dbo.families (id),
  created_at     datetimeoffset(3) NOT NULL CONSTRAINT df_profiles_created DEFAULT (SYSDATETIMEOFFSET())
);
CREATE UNIQUE INDEX uq_profiles_email ON dbo.profiles (email) WHERE email IS NOT NULL;
CREATE INDEX profiles_family_idx ON dbo.profiles (family_id);

-- Sign-in data (Supabase keeps this in auth.users). The API's database user has no
-- access to this table; it reads it only through dbo.find_login.
CREATE TABLE dbo.user_logins (
  profile_id     uniqueidentifier NOT NULL CONSTRAINT pk_user_logins PRIMARY KEY
                 CONSTRAINT fk_user_logins_profile REFERENCES dbo.profiles (id) ON DELETE CASCADE,
  email          nvarchar(320) NOT NULL CONSTRAINT uq_user_logins_email UNIQUE,
  password_hash  nvarchar(500) NOT NULL,
  created_at     datetimeoffset(3) NOT NULL CONSTRAINT df_user_logins_created DEFAULT (SYSDATETIMEOFFSET()),
  updated_at     datetimeoffset(3) NULL
);

CREATE TABLE dbo.accounts (
  id               bigint IDENTITY(1, 1) NOT NULL CONSTRAINT pk_accounts PRIMARY KEY,
  family_id        bigint NOT NULL CONSTRAINT df_accounts_family DEFAULT (CONVERT(bigint, SESSION_CONTEXT(N'family_id')))
                   CONSTRAINT fk_accounts_family REFERENCES dbo.families (id),
  name             nvarchar(100) NOT NULL CONSTRAINT ck_accounts_name CHECK (LEN(name) >= 1),
  type             varchar(20) NOT NULL CONSTRAINT ck_accounts_type CHECK (type IN ('Cash', 'Bank', 'MobileBanking', 'Card', 'Other')),
  opening_balance  decimal(18, 2) NOT NULL CONSTRAINT df_accounts_opening DEFAULT (0),
  note             nvarchar(500) NULL,
  is_active        bit NOT NULL CONSTRAINT df_accounts_active DEFAULT (1),
  created_at       datetimeoffset(3) NOT NULL CONSTRAINT df_accounts_created DEFAULT (SYSDATETIMEOFFSET())
);
CREATE INDEX accounts_family_idx ON dbo.accounts (family_id);

CREATE TABLE dbo.categories (
  id          bigint IDENTITY(1, 1) NOT NULL CONSTRAINT pk_categories PRIMARY KEY,
  family_id   bigint NOT NULL CONSTRAINT df_categories_family DEFAULT (CONVERT(bigint, SESSION_CONTEXT(N'family_id')))
              CONSTRAINT fk_categories_family REFERENCES dbo.families (id),
  name_en     nvarchar(100) NOT NULL CONSTRAINT ck_categories_name_en CHECK (LEN(name_en) >= 1),
  name_bn     nvarchar(100) NOT NULL CONSTRAINT ck_categories_name_bn CHECK (LEN(name_bn) >= 1),
  type        varchar(10) NOT NULL CONSTRAINT ck_categories_type CHECK (type IN ('Income', 'Expense')),
  icon        nvarchar(20) NOT NULL CONSTRAINT df_categories_icon DEFAULT (N'📦'),
  color       varchar(20) NOT NULL CONSTRAINT df_categories_color DEFAULT ('#64748b'),
  sort_order  int NOT NULL CONSTRAINT df_categories_sort DEFAULT (0),
  is_active   bit NOT NULL CONSTRAINT df_categories_active DEFAULT (1)
);
CREATE INDEX categories_family_idx ON dbo.categories (family_id);

CREATE TABLE dbo.projects (
  id          bigint IDENTITY(1, 1) NOT NULL CONSTRAINT pk_projects PRIMARY KEY,
  family_id   bigint NOT NULL CONSTRAINT df_projects_family DEFAULT (CONVERT(bigint, SESSION_CONTEXT(N'family_id')))
              CONSTRAINT fk_projects_family REFERENCES dbo.families (id),
  name        nvarchar(100) NOT NULL CONSTRAINT ck_projects_name CHECK (LEN(name) >= 1),
  budget      decimal(18, 2) NULL CONSTRAINT ck_projects_budget CHECK (budget IS NULL OR budget >= 0),
  note        nvarchar(500) NULL,
  is_done     bit NOT NULL CONSTRAINT df_projects_done DEFAULT (0),
  created_by  uniqueidentifier NOT NULL CONSTRAINT df_projects_created_by DEFAULT (CONVERT(uniqueidentifier, SESSION_CONTEXT(N'user_id')))
              CONSTRAINT fk_projects_created_by REFERENCES dbo.profiles (id),
  created_at  datetimeoffset(3) NOT NULL CONSTRAINT df_projects_created DEFAULT (SYSDATETIMEOFFSET()),
  updated_at  datetimeoffset(3) NULL
);
CREATE INDEX projects_family_idx ON dbo.projects (family_id);

CREATE TABLE dbo.transactions (
  id             bigint IDENTITY(1, 1) NOT NULL CONSTRAINT pk_transactions PRIMARY KEY,
  family_id      bigint NOT NULL CONSTRAINT df_transactions_family DEFAULT (CONVERT(bigint, SESSION_CONTEXT(N'family_id')))
                 CONSTRAINT fk_transactions_family REFERENCES dbo.families (id),
  type           varchar(10) NOT NULL CONSTRAINT ck_transactions_type CHECK (type IN ('Income', 'Expense', 'Transfer')),
  amount         decimal(18, 2) NOT NULL CONSTRAINT ck_transactions_amount CHECK (amount > 0),
  date           date NOT NULL,
  account_id     bigint NOT NULL CONSTRAINT fk_transactions_account REFERENCES dbo.accounts (id),
  to_account_id  bigint NULL CONSTRAINT fk_transactions_to_account REFERENCES dbo.accounts (id),
  category_id    bigint NULL CONSTRAINT fk_transactions_category REFERENCES dbo.categories (id),
  member_id      uniqueidentifier NULL CONSTRAINT fk_transactions_member REFERENCES dbo.profiles (id),
  project_id     bigint NULL CONSTRAINT fk_transactions_project REFERENCES dbo.projects (id),
  quantity       decimal(18, 3) NULL CONSTRAINT ck_transactions_quantity CHECK (quantity IS NULL OR quantity > 0),
  unit           nvarchar(20) NULL,
  note           nvarchar(500) NULL,
  created_by     uniqueidentifier NOT NULL CONSTRAINT df_transactions_created_by DEFAULT (CONVERT(uniqueidentifier, SESSION_CONTEXT(N'user_id')))
                 CONSTRAINT fk_transactions_created_by REFERENCES dbo.profiles (id),
  created_at     datetimeoffset(3) NOT NULL CONSTRAINT df_transactions_created DEFAULT (SYSDATETIMEOFFSET()),
  updated_at     datetimeoffset(3) NULL,
  CONSTRAINT ck_transactions_shape CHECK (
       (type = 'Transfer' AND to_account_id IS NOT NULL AND to_account_id <> account_id AND category_id IS NULL)
    OR (type <> 'Transfer' AND category_id IS NOT NULL AND to_account_id IS NULL)),
  CONSTRAINT ck_transactions_project_shape CHECK (type <> 'Transfer' OR project_id IS NULL)
);
CREATE INDEX transactions_family_idx     ON dbo.transactions (family_id, date DESC, id DESC);
CREATE INDEX transactions_account_idx    ON dbo.transactions (account_id);
CREATE INDEX transactions_to_account_idx ON dbo.transactions (to_account_id);
CREATE INDEX transactions_category_idx   ON dbo.transactions (category_id);
CREATE INDEX transactions_member_idx     ON dbo.transactions (member_id);
CREATE INDEX transactions_project_idx    ON dbo.transactions (project_id);
CREATE INDEX transactions_created_by_idx ON dbo.transactions (created_by);

-- Receivable: money others owe the family (পাওনা). Payable: money the family owes (দেনা).
CREATE TABLE dbo.dues (
  id          bigint IDENTITY(1, 1) NOT NULL CONSTRAINT pk_dues PRIMARY KEY,
  family_id   bigint NOT NULL CONSTRAINT df_dues_family DEFAULT (CONVERT(bigint, SESSION_CONTEXT(N'family_id')))
              CONSTRAINT fk_dues_family REFERENCES dbo.families (id),
  kind        varchar(10) NOT NULL CONSTRAINT ck_dues_kind CHECK (kind IN ('Receivable', 'Payable')),
  person      nvarchar(100) NOT NULL CONSTRAINT ck_dues_person CHECK (LEN(person) >= 1),
  amount      decimal(18, 2) NOT NULL CONSTRAINT ck_dues_amount CHECK (amount >= 0),
  note        nvarchar(500) NULL,
  is_settled  bit NOT NULL CONSTRAINT df_dues_settled DEFAULT (0),
  created_by  uniqueidentifier NOT NULL CONSTRAINT df_dues_created_by DEFAULT (CONVERT(uniqueidentifier, SESSION_CONTEXT(N'user_id')))
              CONSTRAINT fk_dues_created_by REFERENCES dbo.profiles (id),
  created_at  datetimeoffset(3) NOT NULL CONSTRAINT df_dues_created DEFAULT (SYSDATETIMEOFFSET()),
  updated_at  datetimeoffset(3) NULL
);
CREATE INDEX dues_family_idx ON dbo.dues (family_id, kind, is_settled);
GO

/* ---------------------------------------------------------------------
   Request context (set by the API at the start of every request)
   --------------------------------------------------------------------- */
CREATE OR ALTER FUNCTION dbo.current_user_id() RETURNS uniqueidentifier
AS BEGIN RETURN CONVERT(uniqueidentifier, SESSION_CONTEXT(N'user_id')); END;
GO
CREATE OR ALTER FUNCTION dbo.my_family() RETURNS bigint
AS BEGIN RETURN CONVERT(bigint, SESSION_CONTEXT(N'family_id')); END;
GO
CREATE OR ALTER FUNCTION dbo.is_member() RETURNS bit
AS BEGIN RETURN ISNULL(CONVERT(bit, SESSION_CONTEXT(N'is_active')), 0); END;
GO
CREATE OR ALTER FUNCTION dbo.is_admin() RETURNS bit
AS BEGIN RETURN CASE WHEN ISNULL(CONVERT(bit, SESSION_CONTEXT(N'is_active')), 0) = 1
                      AND ISNULL(CONVERT(bit, SESSION_CONTEXT(N'is_admin')), 0) = 1 THEN 1 ELSE 0 END; END;
GO

/* Call once per request after the API has verified who the caller is.
   @read_only = 1 (default) stops anything later on the connection from
   changing the values; pooled connections are reset between requests. */
CREATE OR ALTER PROCEDURE dbo.begin_request
  @user_id uniqueidentifier,
  @read_only bit = 1
WITH EXECUTE AS OWNER
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @family bigint, @active bit, @admin bit;
  SELECT @family = family_id, @active = is_active, @admin = CASE WHEN role = 'Admin' THEN 1 ELSE 0 END
  FROM dbo.profiles WHERE id = @user_id;
  IF @family IS NULL THROW 50000, 'FORBIDDEN', 1;
  EXEC sys.sp_set_session_context @key = N'user_id',   @value = @user_id, @read_only = @read_only;
  EXEC sys.sp_set_session_context @key = N'family_id', @value = @family,  @read_only = @read_only;
  EXEC sys.sp_set_session_context @key = N'is_active', @value = @active,  @read_only = @read_only;
  EXEC sys.sp_set_session_context @key = N'is_admin',  @value = @admin,   @read_only = @read_only;
END;
GO

/* ---------------------------------------------------------------------
   Row-Level Security predicates (inline, read only SESSION_CONTEXT)
   --------------------------------------------------------------------- */
-- Read: an approved member of the row's family.
CREATE OR ALTER FUNCTION rls.family_read(@family_id bigint)
RETURNS TABLE WITH SCHEMABINDING AS RETURN
  SELECT 1 AS ok
  WHERE IS_MEMBER('db_owner') = 1
     OR (CONVERT(bit, SESSION_CONTEXT(N'is_active')) = 1 AND @family_id = CONVERT(bigint, SESSION_CONTEXT(N'family_id')));
GO
-- Profiles: yourself (even before approval), or your family when approved.
CREATE OR ALTER FUNCTION rls.profile_read(@id uniqueidentifier, @family_id bigint)
RETURNS TABLE WITH SCHEMABINDING AS RETURN
  SELECT 1 AS ok
  WHERE IS_MEMBER('db_owner') = 1
     OR @id = CONVERT(uniqueidentifier, SESSION_CONTEXT(N'user_id'))
     OR (CONVERT(bit, SESSION_CONTEXT(N'is_active')) = 1 AND @family_id = CONVERT(bigint, SESSION_CONTEXT(N'family_id')));
GO
-- Write: an approved admin of the row's family.
CREATE OR ALTER FUNCTION rls.admin_write(@family_id bigint)
RETURNS TABLE WITH SCHEMABINDING AS RETURN
  SELECT 1 AS ok
  WHERE IS_MEMBER('db_owner') = 1
     OR (CONVERT(bit, SESSION_CONTEXT(N'is_active')) = 1 AND CONVERT(bit, SESSION_CONTEXT(N'is_admin')) = 1
         AND @family_id = CONVERT(bigint, SESSION_CONTEXT(N'family_id')));
GO
-- Insert: an approved member, in their own family, as themselves.
CREATE OR ALTER FUNCTION rls.member_insert(@family_id bigint, @created_by uniqueidentifier)
RETURNS TABLE WITH SCHEMABINDING AS RETURN
  SELECT 1 AS ok
  WHERE IS_MEMBER('db_owner') = 1
     OR (CONVERT(bit, SESSION_CONTEXT(N'is_active')) = 1
         AND @family_id = CONVERT(bigint, SESSION_CONTEXT(N'family_id'))
         AND @created_by = CONVERT(uniqueidentifier, SESSION_CONTEXT(N'user_id')));
GO
-- Edit / delete: the author, or an admin, of the row's family.
CREATE OR ALTER FUNCTION rls.owner_or_admin(@family_id bigint, @created_by uniqueidentifier)
RETURNS TABLE WITH SCHEMABINDING AS RETURN
  SELECT 1 AS ok
  WHERE IS_MEMBER('db_owner') = 1
     OR (CONVERT(bit, SESSION_CONTEXT(N'is_active')) = 1
         AND @family_id = CONVERT(bigint, SESSION_CONTEXT(N'family_id'))
         AND (CONVERT(bit, SESSION_CONTEXT(N'is_admin')) = 1 OR @created_by = CONVERT(uniqueidentifier, SESSION_CONTEXT(N'user_id'))));
GO

/* ---------------------------------------------------------------------
   Triggers: server-owned columns, same-family references, last admin
   (SQL Server triggers run after the statement; THROW rolls it back.)
   --------------------------------------------------------------------- */
CREATE OR ALTER TRIGGER dbo.profiles_guard ON dbo.profiles AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.id = i.id
             WHERE ISNULL(i.email, N'') <> ISNULL(d.email, N'') AND IS_MEMBER('db_owner') = 0
                OR i.family_id <> d.family_id OR i.created_at <> d.created_at)
    THROW 50000, 'FORBIDDEN', 1;
  -- Never leave a family without an active admin.
  IF EXISTS (SELECT 1 FROM deleted d
             WHERE d.role = 'Admin' AND d.is_active = 1
               AND NOT EXISTS (SELECT 1 FROM dbo.profiles p
                               WHERE p.family_id = d.family_id AND p.role = 'Admin' AND p.is_active = 1))
    THROW 50000, 'LAST_ADMIN', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.accounts_guard ON dbo.accounts AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.id = i.id
             WHERE i.family_id <> d.family_id OR i.created_at <> d.created_at)
    THROW 50000, 'FORBIDDEN', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.categories_guard ON dbo.categories AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.id = i.id WHERE i.family_id <> d.family_id)
    THROW 50000, 'FORBIDDEN', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.projects_guard ON dbo.projects AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.id = i.id
             WHERE i.family_id <> d.family_id OR i.created_by <> d.created_by OR i.created_at <> d.created_at)
    THROW 50000, 'FORBIDDEN', 1;
  IF EXISTS (SELECT 1 FROM deleted)
    UPDATE p SET updated_at = SYSDATETIMEOFFSET() FROM dbo.projects p JOIN inserted i ON i.id = p.id;
END;
GO

CREATE OR ALTER TRIGGER dbo.dues_guard ON dbo.dues AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.id = i.id
             WHERE i.family_id <> d.family_id OR i.created_by <> d.created_by OR i.created_at <> d.created_at)
    THROW 50000, 'FORBIDDEN', 1;
  IF EXISTS (SELECT 1 FROM deleted)
    UPDATE x SET updated_at = SYSDATETIMEOFFSET() FROM dbo.dues x JOIN inserted i ON i.id = x.id;
END;
GO

-- Entries: category must match the type, and every reference must be in the same family.
CREATE OR ALTER TRIGGER dbo.transactions_guard ON dbo.transactions AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.id = i.id
             WHERE i.family_id <> d.family_id OR i.created_by <> d.created_by OR i.created_at <> d.created_at)
    THROW 50000, 'FORBIDDEN', 1;

  IF EXISTS (SELECT 1 FROM inserted i
             WHERE i.type <> 'Transfer'
               AND NOT EXISTS (SELECT 1 FROM dbo.categories c WHERE c.id = i.category_id AND c.type = i.type))
    THROW 50000, 'CATEGORY_REQUIRED', 1;

  IF EXISTS (SELECT 1 FROM inserted i
             WHERE NOT EXISTS (SELECT 1 FROM dbo.accounts a WHERE a.id = i.account_id AND a.family_id = i.family_id)
                OR (i.to_account_id IS NOT NULL AND NOT EXISTS (
                      SELECT 1 FROM dbo.accounts a WHERE a.id = i.to_account_id AND a.family_id = i.family_id))
                OR (i.category_id IS NOT NULL AND NOT EXISTS (
                      SELECT 1 FROM dbo.categories c WHERE c.id = i.category_id AND c.family_id = i.family_id))
                OR (i.project_id IS NOT NULL AND NOT EXISTS (
                      SELECT 1 FROM dbo.projects p WHERE p.id = i.project_id AND p.family_id = i.family_id))
                OR (i.member_id IS NOT NULL AND NOT EXISTS (
                      SELECT 1 FROM dbo.profiles m WHERE m.id = i.member_id AND m.family_id = i.family_id)))
    THROW 50000, 'INVALID_REFERENCE', 1;

  IF EXISTS (SELECT 1 FROM deleted)
    UPDATE t SET updated_at = SYSDATETIMEOFFSET() FROM dbo.transactions t JOIN inserted i ON i.id = t.id;
END;
GO

/* ---------------------------------------------------------------------
   Row-Level Security policies (same rules as the Supabase policies)
   --------------------------------------------------------------------- */
CREATE SECURITY POLICY rls.families_policy
  ADD FILTER PREDICATE rls.family_read(id) ON dbo.families,
  ADD BLOCK PREDICATE rls.admin_write(id) ON dbo.families AFTER UPDATE,
  ADD BLOCK PREDICATE rls.admin_write(id) ON dbo.families BEFORE UPDATE
WITH (STATE = ON);

CREATE SECURITY POLICY rls.profiles_policy
  ADD FILTER PREDICATE rls.profile_read(id, family_id) ON dbo.profiles,
  ADD BLOCK PREDICATE rls.admin_write(family_id) ON dbo.profiles BEFORE UPDATE,
  ADD BLOCK PREDICATE rls.admin_write(family_id) ON dbo.profiles AFTER UPDATE,
  ADD BLOCK PREDICATE rls.admin_write(family_id) ON dbo.profiles AFTER INSERT,
  ADD BLOCK PREDICATE rls.admin_write(family_id) ON dbo.profiles BEFORE DELETE
WITH (STATE = ON);

CREATE SECURITY POLICY rls.accounts_policy
  ADD FILTER PREDICATE rls.family_read(family_id) ON dbo.accounts,
  ADD BLOCK PREDICATE rls.admin_write(family_id) ON dbo.accounts AFTER INSERT,
  ADD BLOCK PREDICATE rls.admin_write(family_id) ON dbo.accounts BEFORE UPDATE,
  ADD BLOCK PREDICATE rls.admin_write(family_id) ON dbo.accounts AFTER UPDATE,
  ADD BLOCK PREDICATE rls.admin_write(family_id) ON dbo.accounts BEFORE DELETE
WITH (STATE = ON);

CREATE SECURITY POLICY rls.categories_policy
  ADD FILTER PREDICATE rls.family_read(family_id) ON dbo.categories,
  ADD BLOCK PREDICATE rls.admin_write(family_id) ON dbo.categories AFTER INSERT,
  ADD BLOCK PREDICATE rls.admin_write(family_id) ON dbo.categories BEFORE UPDATE,
  ADD BLOCK PREDICATE rls.admin_write(family_id) ON dbo.categories AFTER UPDATE,
  ADD BLOCK PREDICATE rls.admin_write(family_id) ON dbo.categories BEFORE DELETE
WITH (STATE = ON);

CREATE SECURITY POLICY rls.transactions_policy
  ADD FILTER PREDICATE rls.family_read(family_id) ON dbo.transactions,
  ADD BLOCK PREDICATE rls.member_insert(family_id, created_by) ON dbo.transactions AFTER INSERT,
  ADD BLOCK PREDICATE rls.owner_or_admin(family_id, created_by) ON dbo.transactions BEFORE UPDATE,
  ADD BLOCK PREDICATE rls.owner_or_admin(family_id, created_by) ON dbo.transactions AFTER UPDATE,
  ADD BLOCK PREDICATE rls.owner_or_admin(family_id, created_by) ON dbo.transactions BEFORE DELETE
WITH (STATE = ON);

CREATE SECURITY POLICY rls.dues_policy
  ADD FILTER PREDICATE rls.family_read(family_id) ON dbo.dues,
  ADD BLOCK PREDICATE rls.member_insert(family_id, created_by) ON dbo.dues AFTER INSERT,
  ADD BLOCK PREDICATE rls.owner_or_admin(family_id, created_by) ON dbo.dues BEFORE UPDATE,
  ADD BLOCK PREDICATE rls.owner_or_admin(family_id, created_by) ON dbo.dues AFTER UPDATE,
  ADD BLOCK PREDICATE rls.owner_or_admin(family_id, created_by) ON dbo.dues BEFORE DELETE
WITH (STATE = ON);

CREATE SECURITY POLICY rls.projects_policy
  ADD FILTER PREDICATE rls.family_read(family_id) ON dbo.projects,
  ADD BLOCK PREDICATE rls.member_insert(family_id, created_by) ON dbo.projects AFTER INSERT,
  ADD BLOCK PREDICATE rls.owner_or_admin(family_id, created_by) ON dbo.projects BEFORE UPDATE,
  ADD BLOCK PREDICATE rls.owner_or_admin(family_id, created_by) ON dbo.projects AFTER UPDATE,
  ADD BLOCK PREDICATE rls.owner_or_admin(family_id, created_by) ON dbo.projects BEFORE DELETE
WITH (STATE = ON);
GO

/* ---------------------------------------------------------------------
   Views (Row-Level Security applies to the tables underneath)
   --------------------------------------------------------------------- */
-- Balances are computed, never stored.
CREATE OR ALTER VIEW dbo.account_balances AS
SELECT
  a.id, a.family_id, a.name, a.type, a.opening_balance, a.note, a.is_active, a.created_at,
  a.opening_balance
    + ISNULL((SELECT SUM(CASE WHEN t.type = 'Income' THEN t.amount ELSE -t.amount END)
              FROM dbo.transactions t WHERE t.account_id = a.id), 0)
    + ISNULL((SELECT SUM(t.amount)
              FROM dbo.transactions t WHERE t.type = 'Transfer' AND t.to_account_id = a.id), 0)
    AS balance
FROM dbo.accounts a;
GO

CREATE OR ALTER VIEW dbo.transaction_details AS
SELECT
  t.id, t.type, t.amount, t.date,
  t.account_id, a.name AS account_name,
  t.to_account_id, ta.name AS to_account_name,
  t.category_id, c.name_en AS category_name_en, c.name_bn AS category_name_bn,
  c.icon AS category_icon, c.color AS category_color,
  t.member_id, m.name AS member_name,
  t.note,
  t.created_by, cb.name AS created_by_name,
  t.created_at,
  t.project_id, p.name AS project_name,
  t.quantity, t.unit
FROM dbo.transactions t
JOIN dbo.accounts a ON a.id = t.account_id
LEFT JOIN dbo.accounts ta ON ta.id = t.to_account_id
LEFT JOIN dbo.categories c ON c.id = t.category_id
LEFT JOIN dbo.profiles m ON m.id = t.member_id
LEFT JOIN dbo.profiles cb ON cb.id = t.created_by
LEFT JOIN dbo.projects p ON p.id = t.project_id;
GO

CREATE OR ALTER VIEW dbo.project_totals AS
SELECT
  p.id, p.name, p.budget, p.note, p.is_done, p.created_by, p.created_at,
  ISNULL(SUM(CASE WHEN t.type = 'Expense' THEN t.amount END), 0) AS expense,
  ISNULL(SUM(CASE WHEN t.type = 'Income' THEN t.amount END), 0) AS income,
  COUNT(t.id) AS entries,
  MIN(t.date) AS first_date,
  MAX(t.date) AS last_date
FROM dbo.projects p
LEFT JOIN dbo.transactions t ON t.project_id = p.id
GROUP BY p.id, p.name, p.budget, p.note, p.is_done, p.created_by, p.created_at;
GO

/* ---------------------------------------------------------------------
   Functions and procedures called by the app
   --------------------------------------------------------------------- */
CREATE OR ALTER FUNCTION dbo.filtered_transactions(
  @from date, @to date,
  @type varchar(10) = NULL, @account bigint = NULL,
  @member uniqueidentifier = NULL, @search nvarchar(200) = NULL,
  @project bigint = NULL)
RETURNS TABLE AS RETURN
  SELECT d.*
  FROM dbo.transaction_details d
  WHERE d.date BETWEEN @from AND @to
    AND (@type IS NULL OR d.type = @type)
    AND (@account IS NULL OR d.account_id = @account OR d.to_account_id = @account)
    AND (@member IS NULL OR d.member_id = @member)
    AND (@project IS NULL OR d.project_id = @project)
    AND (@search IS NULL OR @search = N''
         OR d.note LIKE N'%' + @search + N'%'
         OR d.category_name_en LIKE N'%' + @search + N'%'
         OR d.category_name_bn LIKE N'%' + @search + N'%'
         OR d.project_name LIKE N'%' + @search + N'%');
GO

CREATE OR ALTER PROCEDURE dbo.list_transactions
  @from date, @to date,
  @type varchar(10) = NULL, @account bigint = NULL,
  @member uniqueidentifier = NULL, @search nvarchar(200) = NULL,
  @limit int = 50, @offset int = 0,
  @project bigint = NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @take int = CASE WHEN @limit < 1 THEN 1 WHEN @limit > 200 THEN 200 ELSE @limit END;
  DECLARE @skip int = CASE WHEN @offset < 0 THEN 0 ELSE @offset END;
  SELECT *
  FROM dbo.filtered_transactions(@from, @to, @type, @account, @member, @search, @project)
  ORDER BY date DESC, id DESC
  OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
END;
GO

CREATE OR ALTER FUNCTION dbo.transaction_summary(
  @from date, @to date,
  @type varchar(10) = NULL, @account bigint = NULL,
  @member uniqueidentifier = NULL, @search nvarchar(200) = NULL,
  @project bigint = NULL)
RETURNS TABLE AS RETURN
  SELECT COUNT_BIG(*) AS total,
         ISNULL(SUM(CASE WHEN type = 'Income' THEN amount END), 0) AS income,
         ISNULL(SUM(CASE WHEN type = 'Expense' THEN amount END), 0) AS expense
  FROM dbo.filtered_transactions(@from, @to, @type, @account, @member, @search, @project);
GO

-- balance = active accounts now; actual = balance + open receivable − open payable.
CREATE OR ALTER FUNCTION dbo.balance_summary()
RETURNS TABLE AS RETURN
  SELECT s.balance, s.receivable, s.payable, s.balance + s.receivable - s.payable AS actual
  FROM (SELECT
          ISNULL((SELECT SUM(balance) FROM dbo.account_balances WHERE is_active = 1), 0) AS balance,
          ISNULL((SELECT SUM(amount) FROM dbo.dues WHERE kind = 'Receivable' AND is_settled = 0), 0) AS receivable,
          ISNULL((SELECT SUM(amount) FROM dbo.dues WHERE kind = 'Payable' AND is_settled = 0), 0) AS payable) s;
GO

-- Same JSON shape as the Supabase dashboard() function (camelCase; "recent" in snake_case).
CREATE OR ALTER PROCEDURE dbo.dashboard @year int, @month int
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @s date = DATEFROMPARTS(@year, @month, 1);
  DECLARE @e date = DATEADD(month, 1, @s);
  DECLARE @income decimal(18, 2), @expense decimal(18, 2);

  SELECT @income  = ISNULL(SUM(CASE WHEN type = 'Income' THEN amount END), 0),
         @expense = ISNULL(SUM(CASE WHEN type = 'Expense' THEN amount END), 0)
  FROM dbo.transactions WHERE date >= @s AND date < @e;

  SELECT (
    SELECT
      @year AS [year], @month AS [month], @income AS income, @expense AS expense, @income - @expense AS net,
      ISNULL((SELECT SUM(balance) FROM dbo.account_balances WHERE is_active = 1), 0) AS totalBalance,
      JSON_QUERY(ISNULL((
        SELECT id, name, type, opening_balance AS openingBalance, balance, note, is_active AS isActive
        FROM dbo.account_balances WHERE is_active = 1 ORDER BY name FOR JSON PATH, INCLUDE_NULL_VALUES), '[]')) AS accounts,
      JSON_QUERY(ISNULL((
        SELECT c.id AS categoryId, c.name_en AS nameEn, c.name_bn AS nameBn, c.icon, c.color, SUM(t.amount) AS amount
        FROM dbo.transactions t JOIN dbo.categories c ON c.id = t.category_id
        WHERE t.type = 'Expense' AND t.date >= @s AND t.date < @e
        GROUP BY c.id, c.name_en, c.name_bn, c.icon, c.color
        ORDER BY SUM(t.amount) DESC FOR JSON PATH), '[]')) AS expenseByCategory,
      JSON_QUERY(ISNULL((
        SELECT t.member_id AS memberId, ISNULL(p.name, N'') AS name, SUM(t.amount) AS amount
        FROM dbo.transactions t LEFT JOIN dbo.profiles p ON p.id = t.member_id
        WHERE t.type = 'Expense' AND t.date >= @s AND t.date < @e
        GROUP BY t.member_id, p.name
        ORDER BY SUM(t.amount) DESC FOR JSON PATH, INCLUDE_NULL_VALUES), '[]')) AS expenseByMember,
      JSON_QUERY((
        SELECT YEAR(x.m) AS [year], MONTH(x.m) AS [month],
               ISNULL((SELECT SUM(amount) FROM dbo.transactions
                       WHERE type = 'Income' AND date >= x.m AND date < DATEADD(month, 1, x.m)), 0) AS income,
               ISNULL((SELECT SUM(amount) FROM dbo.transactions
                       WHERE type = 'Expense' AND date >= x.m AND date < DATEADD(month, 1, x.m)), 0) AS expense
        FROM (VALUES (5), (4), (3), (2), (1), (0)) v(k)
        CROSS APPLY (SELECT DATEADD(month, -v.k, @s) AS m) x
        ORDER BY x.m FOR JSON PATH)) AS trend,
      JSON_QUERY(ISNULL((
        SELECT TOP (6) * FROM dbo.transaction_details ORDER BY date DESC, id DESC FOR JSON PATH, INCLUDE_NULL_VALUES), '[]')) AS recent
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
  ) AS dashboard;
END;
GO

/* ---------------------------------------------------------------------
   Families: sign-up, invite codes, default categories
   --------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.seed_family_categories @family_id bigint
WITH EXECUTE AS OWNER
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO dbo.categories (family_id, type, name_en, name_bn, icon, color, sort_order) VALUES
    (@family_id, 'Expense', N'Groceries',         N'বাজার',              N'🛒', '#16a34a', 1),
    (@family_id, 'Expense', N'House Rent',        N'বাসা ভাড়া',          N'🏠', '#9333ea', 2),
    (@family_id, 'Expense', N'Utilities',         N'বিদ্যুৎ/গ্যাস/পানি',   N'💡', '#eab308', 3),
    (@family_id, 'Expense', N'Education',         N'শিক্ষা',             N'📚', '#2563eb', 4),
    (@family_id, 'Expense', N'Medical',           N'চিকিৎসা',            N'💊', '#dc2626', 5),
    (@family_id, 'Expense', N'Transport',         N'যাতায়াত',            N'🚌', '#0891b2', 6),
    (@family_id, 'Expense', N'Clothing',          N'পোশাক',              N'👕', '#db2777', 7),
    (@family_id, 'Expense', N'Mobile & Internet', N'মোবাইল ও ইন্টারনেট',   N'📱', '#4f46e5', 8),
    (@family_id, 'Expense', N'Entertainment',     N'বিনোদন',             N'🎉', '#f97316', 9),
    (@family_id, 'Expense', N'Gifts & Donation',  N'উপহার ও দান',         N'🎁', '#e11d48', 10),
    (@family_id, 'Expense', N'Household',         N'গৃহস্থালি',            N'🧹', '#65a30d', 11),
    (@family_id, 'Expense', N'Other Expense',     N'অন্যান্য খরচ',        N'📦', '#64748b', 99),
    (@family_id, 'Income',  N'Salary',            N'বেতন',               N'💼', '#16a34a', 1),
    (@family_id, 'Income',  N'Business',          N'ব্যবসা',              N'🏪', '#2563eb', 2),
    (@family_id, 'Income',  N'Rent Income',       N'ভাড়া আয়',            N'🏘️', '#9333ea', 3),
    (@family_id, 'Income',  N'Gift',              N'উপহার',              N'🎁', '#db2777', 4),
    (@family_id, 'Income',  N'Other Income',      N'অন্যান্য আয়',         N'💰', '#64748b', 99);
END;
GO

-- Name of the family an invite code belongs to, or NULL. Callable before sign-in.
CREATE OR ALTER PROCEDURE dbo.check_invite @code varchar(20)
WITH EXECUTE AS OWNER
AS
BEGIN
  SET NOCOUNT ON;
  SELECT name FROM dbo.families WHERE invite_code = UPPER(LTRIM(RTRIM(@code)));
END;
GO

/* Creates the person's profile and login (the API hashes the password). With @invite_code: joins that family as an inactive
   Member. Without: starts a new family, as its active Admin, with the default
   categories. Returns the new profile row. */
CREATE OR ALTER PROCEDURE dbo.sign_up
  @user_id uniqueidentifier,
  @email nvarchar(320),
  @name nvarchar(100),
  @password_hash nvarchar(500) = NULL,
  @family_name nvarchar(100) = NULL,
  @invite_code varchar(20) = NULL
WITH EXECUTE AS OWNER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  DECLARE @code varchar(20) = UPPER(LTRIM(RTRIM(ISNULL(@invite_code, ''))));
  DECLARE @person nvarchar(100) = LEFT(ISNULL(NULLIF(LTRIM(RTRIM(@name)), N''), LEFT(@email, CHARINDEX(N'@', @email + N'@') - 1)), 100);
  DECLARE @family bigint;

  BEGIN TRANSACTION;
  IF @code <> ''
  BEGIN
    SELECT @family = id FROM dbo.families WHERE invite_code = @code;
    IF @family IS NULL THROW 50000, 'INVALID_INVITE', 1;
    INSERT INTO dbo.profiles (id, name, email, role, is_active, family_id)
    VALUES (@user_id, @person, @email, 'Member', 0, @family);
  END
  ELSE
  BEGIN
    INSERT INTO dbo.families (name) VALUES (LEFT(ISNULL(NULLIF(LTRIM(RTRIM(@family_name)), N''), @person), 100));
    SET @family = SCOPE_IDENTITY();
    INSERT INTO dbo.profiles (id, name, email, role, is_active, family_id)
    VALUES (@user_id, @person, @email, 'Admin', 1, @family);
    EXEC dbo.seed_family_categories @family_id = @family;
  END;
  IF @password_hash IS NOT NULL
    INSERT INTO dbo.user_logins (profile_id, email, password_hash) VALUES (@user_id, @email, @password_hash);
  COMMIT;

  SELECT id, name, email, relation, role, is_active, family_id, created_at FROM dbo.profiles WHERE id = @user_id;
END;
GO

-- Sign-in: the API looks up the login by email and checks the password hash itself.
CREATE OR ALTER PROCEDURE dbo.find_login @email nvarchar(320)
WITH EXECUTE AS OWNER
AS
BEGIN
  SET NOCOUNT ON;
  SELECT l.profile_id, l.password_hash, p.is_active
  FROM dbo.user_logins l JOIN dbo.profiles p ON p.id = l.profile_id
  WHERE l.email = LTRIM(RTRIM(@email));
END;
GO

-- Change password for the person of the current request (the API checks the old password first).
CREATE OR ALTER PROCEDURE dbo.set_password @password_hash nvarchar(500)
WITH EXECUTE AS OWNER
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @me uniqueidentifier = CONVERT(uniqueidentifier, SESSION_CONTEXT(N'user_id'));
  IF @me IS NULL THROW 50000, 'FORBIDDEN', 1;
  UPDATE dbo.user_logins SET password_hash = @password_hash, updated_at = SYSDATETIMEOFFSET() WHERE profile_id = @me;
  IF @@ROWCOUNT = 0 THROW 50000, 'FORBIDDEN', 1;
END;
GO

-- Admin only: replaces the family's invite code (the old one stops working).
CREATE OR ALTER PROCEDURE dbo.regenerate_invite_code
WITH EXECUTE AS OWNER
AS
BEGIN
  SET NOCOUNT ON;
  IF ISNULL(CONVERT(bit, SESSION_CONTEXT(N'is_active')), 0) = 0 OR ISNULL(CONVERT(bit, SESSION_CONTEXT(N'is_admin')), 0) = 0
    THROW 50000, 'FORBIDDEN', 1;
  DECLARE @code varchar(20) = UPPER(LEFT(REPLACE(CONVERT(varchar(36), NEWID()), '-', ''), 10));
  UPDATE dbo.families SET invite_code = @code WHERE id = CONVERT(bigint, SESSION_CONTEXT(N'family_id'));
  SELECT @code AS invite_code;
END;
GO

/* ---------------------------------------------------------------------
   Role for the API's database user
     CREATE USER moneyflow_api WITH PASSWORD = '<strong password>';   -- Azure SQL (contained user)
     ALTER ROLE moneyflow_app ADD MEMBER moneyflow_api;
   --------------------------------------------------------------------- */
CREATE ROLE moneyflow_app;
GRANT SELECT ON dbo.families TO moneyflow_app;
GRANT UPDATE (name) ON dbo.families TO moneyflow_app;
GRANT SELECT ON dbo.profiles TO moneyflow_app;
GRANT UPDATE (name, relation, role, is_active) ON dbo.profiles TO moneyflow_app;
-- No rights on dbo.user_logins: password hashes are reached only through find_login / set_password.
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.accounts TO moneyflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.categories TO moneyflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.transactions TO moneyflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.dues TO moneyflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.projects TO moneyflow_app;
GRANT SELECT ON dbo.account_balances TO moneyflow_app;
GRANT SELECT ON dbo.transaction_details TO moneyflow_app;
GRANT SELECT ON dbo.project_totals TO moneyflow_app;
GRANT SELECT ON dbo.filtered_transactions TO moneyflow_app;
GRANT SELECT ON dbo.transaction_summary TO moneyflow_app;
GRANT SELECT ON dbo.balance_summary TO moneyflow_app;
GRANT EXECUTE ON dbo.list_transactions TO moneyflow_app;
GRANT EXECUTE ON dbo.dashboard TO moneyflow_app;
GRANT EXECUTE ON dbo.begin_request TO moneyflow_app;
GRANT EXECUTE ON dbo.check_invite TO moneyflow_app;
GRANT EXECUTE ON dbo.sign_up TO moneyflow_app;
GRANT EXECUTE ON dbo.regenerate_invite_code TO moneyflow_app;
GRANT EXECUTE ON dbo.find_login TO moneyflow_app;
GRANT EXECUTE ON dbo.set_password TO moneyflow_app;
GRANT EXECUTE ON dbo.current_user_id TO moneyflow_app;
GRANT EXECUTE ON dbo.my_family TO moneyflow_app;
GRANT EXECUTE ON dbo.is_member TO moneyflow_app;
GRANT EXECUTE ON dbo.is_admin TO moneyflow_app;
GO

SET NOEXEC OFF;
GO
