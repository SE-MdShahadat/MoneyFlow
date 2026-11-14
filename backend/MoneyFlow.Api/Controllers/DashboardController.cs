using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MoneyFlow.Api.Data;
using MoneyFlow.Api.Dtos;
using MoneyFlow.Api.Models;

namespace MoneyFlow.Api.Controllers;

public class DashboardController(AppDbContext db) : ApiControllerBase
{
    [HttpGet]
    public async Task<DashboardDto> Get([FromQuery] int? year, [FromQuery] int? month, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        var y = year ?? today.Year;
        var m = month is >= 1 and <= 12 ? month.Value : today.Month;
        var start = new DateOnly(y, m, 1);
        var end = start.AddMonths(1);

        var monthTx = db.Transactions.Where(t => t.Date >= start && t.Date < end);
        var income = await monthTx.Where(t => t.Type == TransactionType.Income).SumAsync(t => (decimal?)t.Amount, ct) ?? 0;
        var expense = await monthTx.Where(t => t.Type == TransactionType.Expense).SumAsync(t => (decimal?)t.Amount, ct) ?? 0;

        var byCategoryRaw = await monthTx
            .Where(t => t.Type == TransactionType.Expense)
            .GroupBy(t => t.CategoryId)
            .Select(g => new { CategoryId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToListAsync(ct);
        var categories = await db.Categories.ToDictionaryAsync(c => c.Id, ct);
        var byCategory = byCategoryRaw
            .Select(x => x.CategoryId is int id && categories.TryGetValue(id, out var c)
                ? new CategoryTotalDto(id, c.NameEn, c.NameBn, c.Icon, c.Color, x.Amount)
                : new CategoryTotalDto(null, "Uncategorized", "শ্রেণিহীন", "📦", "#64748b", x.Amount))
            .OrderByDescending(x => x.Amount)
            .ToList();

        var byMemberRaw = await monthTx
            .Where(t => t.Type == TransactionType.Expense)
            .GroupBy(t => t.MemberId)
            .Select(g => new { MemberId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToListAsync(ct);
        var members = await db.Users.ToDictionaryAsync(u => u.Id, u => u.Name, ct);
        var byMember = byMemberRaw
            .Select(x => new MemberTotalDto(x.MemberId, x.MemberId is int id && members.TryGetValue(id, out var n) ? n : "", x.Amount))
            .OrderByDescending(x => x.Amount)
            .ToList();

        var trendStart = start.AddMonths(-5);
        var trendRaw = await db.Transactions
            .Where(t => t.Date >= trendStart && t.Date < end && t.Type != TransactionType.Transfer)
            .GroupBy(t => new { t.Date.Year, t.Date.Month, t.Type })
            .Select(g => new { g.Key.Year, g.Key.Month, g.Key.Type, Amount = g.Sum(x => x.Amount) })
            .ToListAsync(ct);
        var trend = Enumerable.Range(0, 6)
            .Select(i => trendStart.AddMonths(i))
            .Select(d => new MonthTotalDto(
                d.Year, d.Month,
                trendRaw.Where(r => r.Year == d.Year && r.Month == d.Month && r.Type == TransactionType.Income).Sum(r => r.Amount),
                trendRaw.Where(r => r.Year == d.Year && r.Month == d.Month && r.Type == TransactionType.Expense).Sum(r => r.Amount)))
            .ToList();

        var accounts = await AccountsController.ListWithBalances(db, ct);
        var recent = await TransactionsController
            .Project(db.Transactions.OrderByDescending(t => t.Date).ThenByDescending(t => t.Id).Take(6))
            .ToListAsync(ct);

        return new DashboardDto(
            y, m, income, expense, income - expense,
            accounts.Where(a => a.IsActive).Sum(a => a.Balance),
            accounts.Where(a => a.IsActive).ToList(),
            byCategory, byMember, trend, recent);
    }
}
