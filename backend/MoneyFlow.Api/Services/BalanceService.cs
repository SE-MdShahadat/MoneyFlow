using Microsoft.EntityFrameworkCore;
using MoneyFlow.Api.Data;
using MoneyFlow.Api.Models;

namespace MoneyFlow.Api.Services;

public static class BalanceService
{
    /// <summary>Current balance of every account: opening balance plus all money flowing in and out.</summary>
    public static async Task<Dictionary<int, decimal>> GetBalancesAsync(AppDbContext db, CancellationToken ct)
    {
        var balances = await db.Accounts.ToDictionaryAsync(a => a.Id, a => a.OpeningBalance, ct);

        var outflows = await db.Transactions
            .GroupBy(t => new { t.AccountId, t.Type })
            .Select(g => new { g.Key.AccountId, g.Key.Type, Sum = g.Sum(x => x.Amount) })
            .ToListAsync(ct);

        foreach (var f in outflows)
        {
            balances[f.AccountId] += f.Type == TransactionType.Income ? f.Sum : -f.Sum;
        }

        var transfersIn = await db.Transactions
            .Where(t => t.Type == TransactionType.Transfer && t.ToAccountId != null)
            .GroupBy(t => t.ToAccountId!.Value)
            .Select(g => new { AccountId = g.Key, Sum = g.Sum(x => x.Amount) })
            .ToListAsync(ct);

        foreach (var f in transfersIn)
        {
            balances[f.AccountId] += f.Sum;
        }

        return balances;
    }
}
