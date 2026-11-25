/* =====================================================================
   MoneyFlow (SQL Server) — family isolation and permission test
   Run on a FRESH TEST database right after Scripts/MoneyFlow_SqlServer.sql,
   never on the real one: it creates test families, people and entries.
   Prints one line per check; every line should start with PASS.
     sqlcmd -S <server> -d <test db> -E -I -f 65001 -i Scripts/tests/MoneyFlow_SqlServer_Test.sql
   ===================================================================== */
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.families)
BEGIN
  RAISERROR (N'This database already has families. Run the test on a fresh test database.', 16, 1);
  SET NOEXEC ON;
END;
GO

-- The API's database user: a non-owner in role moneyflow_app, so Row-Level Security applies.
IF USER_ID(N'iso_api') IS NULL CREATE USER iso_api WITHOUT LOGIN;
ALTER ROLE moneyflow_app ADD MEMBER iso_api;
GO

DECLARE @r TABLE (n int IDENTITY, line nvarchar(400));
DECLARE @a uniqueidentifier = NEWID(), @b uniqueidentifier = NEWID(), @c uniqueidentifier = NEWID();
DECLARE @fa bigint, @fb bigint, @code_a varchar(20), @acc_a bigint, @acc_b bigint, @tx_a bigint, @cat bigint, @n int, @ok bit, @json nvarchar(max);
DECLARE @dash TABLE (j nvarchar(max));
DECLARE @sink TABLE (id uniqueidentifier, name nvarchar(100), email nvarchar(320), relation nvarchar(50), role varchar(10), is_active bit, family_id bigint, created_at datetimeoffset(3));

/* ---------- Sign-ups (the API calls sign_up) ---------- */
INSERT INTO @sink EXEC dbo.sign_up @user_id = @a, @email = N'iso-a@example.invalid', @name = N'Test A', @password_hash = N'test-hash-a', @family_name = N'Test family A';
INSERT INTO @sink EXEC dbo.sign_up @user_id = @b, @email = N'iso-b@example.invalid', @name = N'Test B', @family_name = N'Test family B';
SELECT @fa = family_id FROM dbo.profiles WHERE id = @a;
SELECT @fb = family_id FROM dbo.profiles WHERE id = @b;
SELECT @code_a = invite_code FROM dbo.families WHERE id = @fa;
INSERT @r VALUES (CASE WHEN @fa IS NOT NULL AND @fb IS NOT NULL AND @fa <> @fb THEN 'PASS' ELSE 'FAIL' END + ' new families created for sign-ups');
SELECT @n = COUNT(*) FROM dbo.profiles WHERE id IN (@a, @b) AND role = 'Admin' AND is_active = 1;
INSERT @r VALUES (CASE WHEN @n = 2 THEN 'PASS' ELSE 'FAIL' END + ' both founders are active admins');
SELECT @n = COUNT(*) FROM dbo.categories WHERE family_id = @fa;
INSERT @r VALUES (CASE WHEN @n = 17 THEN 'PASS' ELSE 'FAIL' END + ' family A got 17 default categories (' + CONVERT(varchar, @n) + ')');

INSERT INTO @sink EXEC dbo.sign_up @user_id = @c, @email = N'iso-c@example.invalid', @name = N'Test C', @invite_code = @code_a;
SELECT @n = COUNT(*) FROM dbo.profiles WHERE id = @c AND family_id = @fa AND is_active = 0 AND role = 'Member';
INSERT @r VALUES (CASE WHEN @n = 1 THEN 'PASS' ELSE 'FAIL' END + ' invite code joins family A as an inactive member');

BEGIN TRY
  INSERT INTO @sink EXEC dbo.sign_up @user_id = NULL, @email = N'iso-d@example.invalid', @name = N'Test D', @invite_code = 'NOPE';
  INSERT @r VALUES ('FAIL wrong invite code was accepted');
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  INSERT @r VALUES (CASE WHEN ERROR_MESSAGE() = 'INVALID_INVITE' THEN 'PASS' ELSE 'FAIL (' + ERROR_MESSAGE() + ')' END + ' wrong invite code is refused');
END CATCH;

/* ---------- As A (admin of family A) ---------- */
EXECUTE AS USER = N'iso_api';
EXEC dbo.begin_request @user_id = @a, @read_only = 0;

INSERT INTO dbo.accounts (name, type, opening_balance) VALUES (N'A cash', 'Cash', 1000);
SET @acc_a = SCOPE_IDENTITY();
SELECT @n = COUNT(*) FROM dbo.accounts WHERE id = @acc_a AND family_id = @fa;
INSERT @r VALUES (CASE WHEN @n = 1 THEN 'PASS' ELSE 'FAIL' END + ' new rows get the family automatically');

SELECT TOP (1) @cat = id FROM dbo.categories WHERE type = 'Expense';
INSERT INTO dbo.transactions (type, amount, date, account_id, category_id) VALUES ('Expense', 50, CONVERT(date, SYSDATETIME()), @acc_a, @cat);
SET @tx_a = SCOPE_IDENTITY();
SELECT @n = COUNT(*) FROM dbo.transactions WHERE id = @tx_a AND created_by = @a;
INSERT @r VALUES (CASE WHEN @n = 1 THEN 'PASS' ELSE 'FAIL' END + ' entries record their author');
SELECT @ok = CASE WHEN balance = 950 THEN 1 ELSE 0 END FROM dbo.account_balances WHERE id = @acc_a;
INSERT @r VALUES (CASE WHEN @ok = 1 THEN 'PASS' ELSE 'FAIL' END + ' balance = opening − expense');
SELECT @n = COUNT(*) FROM dbo.profiles;
INSERT @r VALUES (CASE WHEN @n = 2 THEN 'PASS' ELSE 'FAIL' END + ' A sees only own family members (' + CONVERT(varchar, @n) + ')');

BEGIN TRY
  UPDATE dbo.profiles SET role = 'Member' WHERE id = @a;
  INSERT @r VALUES ('FAIL the last admin could step down');
END TRY
BEGIN CATCH
  INSERT @r VALUES (CASE WHEN ERROR_MESSAGE() = 'LAST_ADMIN' THEN 'PASS' ELSE 'FAIL (' + ERROR_MESSAGE() + ')' END + ' the last admin cannot step down');
END CATCH;
REVERT;

/* ---------- As B: try to see or touch family A ---------- */
EXECUTE AS USER = N'iso_api';
EXEC dbo.begin_request @user_id = @b, @read_only = 0;

SELECT @n = COUNT(*) FROM dbo.accounts WHERE family_id = @fa;
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END + ' B cannot see A''s accounts');
SELECT @n = COUNT(*) FROM dbo.account_balances WHERE id = @acc_a;
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END + ' B cannot see A''s balances');
SELECT @n = COUNT(*) FROM dbo.transaction_details;
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END + ' B''s entry list is empty');
SELECT @n = COUNT(*) FROM dbo.categories;
INSERT @r VALUES (CASE WHEN @n = 17 THEN 'PASS' ELSE 'FAIL' END + ' B sees only its own 17 categories (' + CONVERT(varchar, @n) + ')');
SELECT @n = COUNT(*) FROM dbo.profiles;
INSERT @r VALUES (CASE WHEN @n = 1 THEN 'PASS' ELSE 'FAIL' END + ' B sees only itself in members (' + CONVERT(varchar, @n) + ')');
SELECT @n = COUNT(*) FROM dbo.families;
INSERT @r VALUES (CASE WHEN @n = 1 THEN 'PASS' ELSE 'FAIL' END + ' B sees only its own family');
SELECT @n = COUNT(*) FROM dbo.families WHERE invite_code = @code_a;
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END + ' B cannot read A''s invite code');

DECLARE @y int = YEAR(SYSDATETIME()), @m int = MONTH(SYSDATETIME());
INSERT INTO @dash EXEC dbo.dashboard @year = @y, @month = @m;
SELECT @json = j FROM @dash;
INSERT @r VALUES (CASE WHEN ISJSON(@json) = 1 AND CONVERT(decimal(18, 2), JSON_VALUE(@json, '$.expense')) = 0 THEN 'PASS' ELSE 'FAIL' END + ' B''s dashboard does not count A''s spending');

UPDATE dbo.accounts SET name = N'hacked' WHERE id = @acc_a;
INSERT @r VALUES (CASE WHEN @@ROWCOUNT = 0 THEN 'PASS' ELSE 'FAIL' END + ' B cannot rename A''s account');
DELETE FROM dbo.transactions WHERE id = @tx_a;
INSERT @r VALUES (CASE WHEN @@ROWCOUNT = 0 THEN 'PASS' ELSE 'FAIL' END + ' B cannot delete A''s entries');

INSERT INTO dbo.accounts (name, type) VALUES (N'B bank', 'Bank');
SET @acc_b = SCOPE_IDENTITY();
BEGIN TRY
  INSERT INTO dbo.transactions (type, amount, date, account_id, to_account_id) VALUES ('Transfer', 10, CONVERT(date, SYSDATETIME()), @acc_b, @acc_a);
  INSERT @r VALUES ('FAIL B could transfer into A''s account');
END TRY
BEGIN CATCH
  INSERT @r VALUES (CASE WHEN ERROR_MESSAGE() = 'INVALID_REFERENCE' THEN 'PASS' ELSE 'FAIL (' + ERROR_MESSAGE() + ')' END + ' B cannot point an entry at A''s account');
END CATCH;
BEGIN TRY
  UPDATE dbo.accounts SET family_id = @fa WHERE id = @acc_b;
  INSERT @r VALUES ('FAIL B could move a row into family A');
END TRY
BEGIN CATCH
  INSERT @r VALUES ('PASS B cannot move a row into family A');
END CATCH;
BEGIN TRY
  INSERT INTO dbo.accounts (family_id, name, type) VALUES (@fa, N'planted', 'Cash');
  INSERT @r VALUES ('FAIL B could add a row to family A');
END TRY
BEGIN CATCH
  INSERT @r VALUES ('PASS B cannot add a row to family A');
END CATCH;
BEGIN TRY
  DECLARE @codes TABLE (c varchar(20));
  INSERT INTO @codes EXEC dbo.regenerate_invite_code;
  INSERT @r VALUES ('PASS admin B can renew its own invite code');
END TRY
BEGIN CATCH
  INSERT @r VALUES ('FAIL admin B could not renew its invite code (' + ERROR_MESSAGE() + ')');
END CATCH;
REVERT;
SELECT @n = COUNT(*) FROM dbo.families WHERE id = @fa AND invite_code = @code_a;
INSERT @r VALUES (CASE WHEN @n = 1 THEN 'PASS' ELSE 'FAIL' END + ' A''s invite code was not changed by B');

EXECUTE AS USER = N'iso_api';
BEGIN TRY
  SELECT @n = COUNT(*) FROM dbo.user_logins;
  INSERT @r VALUES ('FAIL the app user can read password hashes');
END TRY
BEGIN CATCH
  INSERT @r VALUES ('PASS the app user cannot read password hashes');
END CATCH;
DECLARE @login TABLE (profile_id uniqueidentifier, password_hash nvarchar(500), is_active bit);
INSERT INTO @login EXEC dbo.find_login @email = N'iso-a@example.invalid';
SELECT @n = COUNT(*) FROM @login WHERE profile_id = @a AND password_hash = N'test-hash-a';
INSERT @r VALUES (CASE WHEN @n = 1 THEN 'PASS' ELSE 'FAIL' END + ' sign-in lookup finds the login by email');
REVERT;

/* ---------- As C: before and after approval ---------- */
EXECUTE AS USER = N'iso_api';
EXEC dbo.begin_request @user_id = @c, @read_only = 0;
SELECT @n = COUNT(*) FROM dbo.accounts;
INSERT @r VALUES (CASE WHEN @n = 0 THEN 'PASS' ELSE 'FAIL' END + ' unapproved C sees no accounts');
SELECT @n = COUNT(*) FROM dbo.profiles;
INSERT @r VALUES (CASE WHEN @n = 1 THEN 'PASS' ELSE 'FAIL' END + ' unapproved C sees only its own profile');
BEGIN TRY
  INSERT INTO dbo.transactions (type, amount, date, account_id, category_id) VALUES ('Expense', 5, CONVERT(date, SYSDATETIME()), @acc_a, @cat);
  INSERT @r VALUES ('FAIL unapproved C could add an entry');
END TRY
BEGIN CATCH
  INSERT @r VALUES ('PASS unapproved C cannot add entries');
END CATCH;
REVERT;

EXECUTE AS USER = N'iso_api';
EXEC dbo.begin_request @user_id = @a, @read_only = 0;
UPDATE dbo.profiles SET is_active = 1 WHERE id = @c;
INSERT @r VALUES (CASE WHEN @@ROWCOUNT = 1 THEN 'PASS' ELSE 'FAIL' END + ' admin A approves C');
REVERT;

EXECUTE AS USER = N'iso_api';
EXEC dbo.begin_request @user_id = @c, @read_only = 0;
BEGIN TRY
  INSERT INTO dbo.transactions (type, amount, date, account_id, category_id) VALUES ('Expense', 5, CONVERT(date, SYSDATETIME()), @acc_a, @cat);
  INSERT @r VALUES ('PASS approved member C can add entries');
END TRY
BEGIN CATCH
  INSERT @r VALUES ('FAIL approved C could not add an entry (' + ERROR_MESSAGE() + ')');
END CATCH;
BEGIN TRY
  DELETE FROM dbo.transactions WHERE id = @tx_a;
  INSERT @r VALUES ('FAIL member C could delete admin A''s entry');
END TRY
BEGIN CATCH
  INSERT @r VALUES ('PASS member C cannot delete someone else''s entry');
END CATCH;
BEGIN TRY
  UPDATE dbo.accounts SET name = N'renamed' WHERE id = @acc_a;
  INSERT @r VALUES ('FAIL member C could rename an account');
END TRY
BEGIN CATCH
  INSERT @r VALUES ('PASS member C cannot manage accounts');
END CATCH;
REVERT;

SELECT line AS result FROM @r ORDER BY n;
GO

SET NOEXEC OFF;
GO
