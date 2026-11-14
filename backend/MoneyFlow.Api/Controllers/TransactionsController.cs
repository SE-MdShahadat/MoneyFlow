using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MoneyFlow.Api.Data;
using MoneyFlow.Api.Dtos;
using MoneyFlow.Api.Models;

namespace MoneyFlow.Api.Controllers;

public class TransactionsController(AppDbContext db) : ApiControllerBase
{
    internal static IQueryable<TransactionDto> Project(IQueryable<Transaction> q) =>
        q.Select(t => new TransactionDto(
            t.Id, t.Type, t.Amount, t.Date,
            t.AccountId, t.Account!.Name,
            t.ToAccountId, t.ToAccount != null ? t.ToAccount.Name : null,
            t.CategoryId,
            t.Category != null ? t.Category.NameEn : null,
            t.Category != null ? t.Category.NameBn : null,
            t.Category != null ? t.Category.Icon : null,
            t.Category != null ? t.Category.Color : null,
            t.MemberId, t.Member != null ? t.Member.Name : null,
            t.Note,
            t.CreatedById, t.CreatedBy!.Name,
            t.CreatedAt));

    [HttpGet]
    public async Task<TransactionPage> List(
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] TransactionType? type,
        [FromQuery] int? accountId,
        [FromQuery] int? categoryId,
        [FromQuery] int? memberId,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = db.Transactions.AsQueryable();
        if (from is not null) q = q.Where(t => t.Date >= from);
        if (to is not null) q = q.Where(t => t.Date <= to);
        if (type is not null) q = q.Where(t => t.Type == type);
        if (accountId is not null) q = q.Where(t => t.AccountId == accountId || t.ToAccountId == accountId);
        if (categoryId is not null) q = q.Where(t => t.CategoryId == categoryId);
        if (memberId is not null) q = q.Where(t => t.MemberId == memberId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(t => (t.Note != null && t.Note.Contains(s))
                          || (t.Category != null && (t.Category.NameEn.Contains(s) || t.Category.NameBn.Contains(s))));
        }

        var total = await q.CountAsync(ct);
        var income = await q.Where(t => t.Type == TransactionType.Income).SumAsync(t => (decimal?)t.Amount, ct) ?? 0;
        var expense = await q.Where(t => t.Type == TransactionType.Expense).SumAsync(t => (decimal?)t.Amount, ct) ?? 0;

        var items = await Project(q.OrderByDescending(t => t.Date).ThenByDescending(t => t.Id))
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new TransactionPage(items, total, income, expense);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TransactionDto>> Get(int id, CancellationToken ct)
    {
        var dto = await Project(db.Transactions.Where(t => t.Id == id)).FirstOrDefaultAsync(ct);
        return dto is null ? NotFound() : dto;
    }

    [HttpPost]
    public async Task<ActionResult<TransactionDto>> Create(TransactionSaveRequest req, CancellationToken ct)
    {
        var error = await Validate(req, ct);
        if (error is not null) return error;

        var tx = new Transaction { CreatedById = CurrentUserId };
        Apply(tx, req);
        db.Transactions.Add(tx);
        await db.SaveChangesAsync(ct);
        return await Project(db.Transactions.Where(t => t.Id == tx.Id)).FirstAsync(ct);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<TransactionDto>> Update(int id, TransactionSaveRequest req, CancellationToken ct)
    {
        var tx = await db.Transactions.FindAsync([id], ct);
        if (tx is null) return NotFound();
        if (!CanModify(tx)) return Error(403, "FORBIDDEN", "You can only change your own entries.");

        var error = await Validate(req, ct);
        if (error is not null) return error;

        Apply(tx, req);
        tx.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return await Project(db.Transactions.Where(t => t.Id == id)).FirstAsync(ct);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var tx = await db.Transactions.FindAsync([id], ct);
        if (tx is null) return NotFound();
        if (!CanModify(tx)) return Error(403, "FORBIDDEN", "You can only delete your own entries.");

        db.Transactions.Remove(tx);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private bool CanModify(Transaction tx) => IsAdmin || tx.CreatedById == CurrentUserId;

    private async Task<ObjectResult?> Validate(TransactionSaveRequest req, CancellationToken ct)
    {
        if (!await db.Accounts.AnyAsync(a => a.Id == req.AccountId, ct))
            return BadRequestError("ACCOUNT_REQUIRED", "Choose a valid account.");

        if (req.MemberId is not null && !await db.Users.AnyAsync(u => u.Id == req.MemberId, ct))
            return BadRequestError("MEMBER_INVALID", "Choose a valid family member.");

        if (req.Type == TransactionType.Transfer)
        {
            if (req.ToAccountId is null || req.ToAccountId == req.AccountId
                || !await db.Accounts.AnyAsync(a => a.Id == req.ToAccountId, ct))
                return BadRequestError("TO_ACCOUNT_INVALID", "Choose a different account to transfer to.");
            return null;
        }

        var expected = req.Type == TransactionType.Income ? CategoryType.Income : CategoryType.Expense;
        if (req.CategoryId is null || !await db.Categories.AnyAsync(c => c.Id == req.CategoryId && c.Type == expected, ct))
            return BadRequestError("CATEGORY_REQUIRED", "Choose a valid category.");

        return null;
    }

    private static void Apply(Transaction tx, TransactionSaveRequest req)
    {
        tx.Type = req.Type;
        tx.Amount = decimal.Round(req.Amount, 2);
        tx.Date = req.Date;
        tx.AccountId = req.AccountId;
        tx.ToAccountId = req.Type == TransactionType.Transfer ? req.ToAccountId : null;
        tx.CategoryId = req.Type == TransactionType.Transfer ? null : req.CategoryId;
        tx.MemberId = req.MemberId;
        tx.Note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim();
    }
}
