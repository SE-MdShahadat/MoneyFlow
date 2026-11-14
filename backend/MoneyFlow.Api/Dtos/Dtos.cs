using System.ComponentModel.DataAnnotations;
using MoneyFlow.Api.Models;

namespace MoneyFlow.Api.Dtos;

/// <summary>Error body returned by the API. <c>Code</c> lets the frontend show a translated message.</summary>
public record ApiError(string Code, string Message);

// ---------- Auth ----------
public record AuthStatusDto(bool NeedsSetup);

public record SetupRequest(
    [Required, MaxLength(100)] string Name,
    [Required, MaxLength(50)] string Username,
    [Required, MinLength(6), MaxLength(100)] string Password);

public record LoginRequest([Required] string Username, [Required] string Password);

public record ChangePasswordRequest([Required] string CurrentPassword, [Required, MinLength(6), MaxLength(100)] string NewPassword);

public record UserDto(int Id, string Name, string Username, UserRole Role, string? Relation, bool IsActive);

public record LoginResponse(string Token, UserDto User);

// ---------- Users ----------
public record UserCreateRequest(
    [Required, MaxLength(100)] string Name,
    [Required, MaxLength(50)] string Username,
    [Required, MinLength(6), MaxLength(100)] string Password,
    UserRole Role,
    [MaxLength(50)] string? Relation);

public record UserUpdateRequest(
    [Required, MaxLength(100)] string Name,
    UserRole Role,
    [MaxLength(50)] string? Relation,
    bool IsActive,
    /// <summary>Leave empty to keep the current password.</summary>
    [MinLength(6), MaxLength(100)] string? NewPassword);

// ---------- Accounts ----------
public record AccountDto(int Id, string Name, AccountType Type, decimal OpeningBalance, decimal Balance, string? Note, bool IsActive);

public record AccountSaveRequest(
    [Required, MaxLength(100)] string Name,
    AccountType Type,
    decimal OpeningBalance,
    [MaxLength(500)] string? Note,
    bool IsActive = true);

// ---------- Categories ----------
public record CategoryDto(int Id, string NameEn, string NameBn, CategoryType Type, string Icon, string Color, int SortOrder, bool IsActive);

public record CategorySaveRequest(
    [Required, MaxLength(100)] string NameEn,
    [Required, MaxLength(100)] string NameBn,
    CategoryType Type,
    [MaxLength(20)] string? Icon,
    [MaxLength(20)] string? Color,
    int SortOrder,
    bool IsActive = true);

// ---------- Transactions ----------
public record TransactionDto(
    int Id,
    TransactionType Type,
    decimal Amount,
    DateOnly Date,
    int AccountId,
    string AccountName,
    int? ToAccountId,
    string? ToAccountName,
    int? CategoryId,
    string? CategoryNameEn,
    string? CategoryNameBn,
    string? CategoryIcon,
    string? CategoryColor,
    int? MemberId,
    string? MemberName,
    string? Note,
    int CreatedById,
    string CreatedByName,
    DateTime CreatedAt);

public record TransactionSaveRequest(
    TransactionType Type,
    [Range(0.01, 999_999_999_999)] decimal Amount,
    DateOnly Date,
    int AccountId,
    int? ToAccountId,
    int? CategoryId,
    int? MemberId,
    [MaxLength(500)] string? Note);

public record TransactionPage(IReadOnlyList<TransactionDto> Items, int Total, decimal TotalIncome, decimal TotalExpense);

// ---------- Dashboard ----------
public record CategoryTotalDto(int? CategoryId, string NameEn, string NameBn, string Icon, string Color, decimal Amount);

public record MemberTotalDto(int? MemberId, string Name, decimal Amount);

public record MonthTotalDto(int Year, int Month, decimal Income, decimal Expense);

public record DashboardDto(
    int Year,
    int Month,
    decimal Income,
    decimal Expense,
    decimal Net,
    decimal TotalBalance,
    IReadOnlyList<AccountDto> Accounts,
    IReadOnlyList<CategoryTotalDto> ExpenseByCategory,
    IReadOnlyList<MemberTotalDto> ExpenseByMember,
    IReadOnlyList<MonthTotalDto> Trend,
    IReadOnlyList<TransactionDto> Recent);
