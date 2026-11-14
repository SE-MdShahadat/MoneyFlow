-- MoneyFlow: which server/database the app uses, and what is in it.
-- Run with F5 (or the Execute button).
USE MoneyFlow;
GO

SELECT @@SERVERNAME AS [Server], DB_NAME() AS [Database];

SELECT TABLE_NAME AS [Table]
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

SELECT Id, Name, Username, Role, IsActive, CreatedAt FROM dbo.Users;
SELECT * FROM dbo.Accounts;
SELECT Id, Type, NameEn, NameBn, Icon FROM dbo.Categories ORDER BY Type, SortOrder;
SELECT TOP 50 * FROM dbo.Transactions ORDER BY Date DESC, Id DESC;
