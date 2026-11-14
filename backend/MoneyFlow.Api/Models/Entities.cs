namespace MoneyFlow.Api.Models;

/// <summary>A family member. Every member can log in; Admins also manage setup data.</summary>
public class User
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public required string Username { get; set; }
    public required string PasswordHash { get; set; }
    public UserRole Role { get; set; } = UserRole.Member;
    /// <summary>Free text such as "Father", "Wife", "Son".</summary>
    public string? Relation { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Where money is kept: cash in hand, a bank account, bKash/Nagad wallet, etc.</summary>
public class Account
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public AccountType Type { get; set; }
    public decimal OpeningBalance { get; set; }
    public string? Note { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Category
{
    public int Id { get; set; }
    public required string NameEn { get; set; }
    public required string NameBn { get; set; }
    public CategoryType Type { get; set; }
    public string Icon { get; set; } = "📦";
    public string Color { get; set; } = "#64748b";
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// One money movement. Income adds to <see cref="AccountId"/>, Expense subtracts from it,
/// Transfer moves the amount from <see cref="AccountId"/> to <see cref="ToAccountId"/>.
/// </summary>
public class Transaction
{
    public int Id { get; set; }
    public TransactionType Type { get; set; }
    public decimal Amount { get; set; }
    public DateOnly Date { get; set; }

    public int AccountId { get; set; }
    public Account? Account { get; set; }

    public int? ToAccountId { get; set; }
    public Account? ToAccount { get; set; }

    public int? CategoryId { get; set; }
    public Category? Category { get; set; }

    /// <summary>The family member the income/expense belongs to (optional).</summary>
    public int? MemberId { get; set; }
    public User? Member { get; set; }

    public string? Note { get; set; }

    public int CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}
