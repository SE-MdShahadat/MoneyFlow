namespace MoneyFlow.Api.Models;

public enum UserRole
{
    Admin = 1,
    Member = 2
}

public enum AccountType
{
    Cash = 1,
    Bank = 2,
    MobileBanking = 3,
    Card = 4,
    Other = 5
}

public enum CategoryType
{
    Income = 1,
    Expense = 2
}

public enum TransactionType
{
    Income = 1,
    Expense = 2,
    Transfer = 3
}
