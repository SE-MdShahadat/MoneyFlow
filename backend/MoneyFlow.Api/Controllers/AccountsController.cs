using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MoneyFlow.Api.Data;
using MoneyFlow.Api.Dtos;
using MoneyFlow.Api.Models;
using MoneyFlow.Api.Services;

namespace MoneyFlow.Api.Controllers;

public class AccountsController(AppDbContext db) : ApiControllerBase
{
    internal static async Task<List<AccountDto>> ListWithBalances(AppDbContext db, CancellationToken ct)
    {
        var balances = await BalanceService.GetBalancesAsync(db, ct);
        var accounts = await db.Accounts.OrderByDescending(a => a.IsActive).ThenBy(a => a.Name).ToListAsync(ct);
        return accounts
            .Select(a => new AccountDto(a.Id, a.Name, a.Type, a.OpeningBalance, balances[a.Id], a.Note, a.IsActive))
            .ToList();
    }

    [HttpGet]
    public Task<List<AccountDto>> List(CancellationToken ct) => ListWithBalances(db, ct);

    [Authorize(Roles = nameof(UserRole.Admin)), HttpPost]
    public async Task<ActionResult<AccountDto>> Create(AccountSaveRequest req, CancellationToken ct)
    {
        var account = new Account
        {
            Name = req.Name.Trim(),
            Type = req.Type,
            OpeningBalance = req.OpeningBalance,
            Note = req.Note?.Trim(),
            IsActive = req.IsActive,
        };
        db.Accounts.Add(account);
        await db.SaveChangesAsync(ct);
        return (await ListWithBalances(db, ct)).First(a => a.Id == account.Id);
    }

    [Authorize(Roles = nameof(UserRole.Admin)), HttpPut("{id:int}")]
    public async Task<ActionResult<AccountDto>> Update(int id, AccountSaveRequest req, CancellationToken ct)
    {
        var account = await db.Accounts.FindAsync([id], ct);
        if (account is null) return NotFound();

        account.Name = req.Name.Trim();
        account.Type = req.Type;
        account.OpeningBalance = req.OpeningBalance;
        account.Note = req.Note?.Trim();
        account.IsActive = req.IsActive;
        await db.SaveChangesAsync(ct);
        return (await ListWithBalances(db, ct)).First(a => a.Id == id);
    }

    /// <summary>Deletes an unused account; an account with history is only deactivated.</summary>
    [Authorize(Roles = nameof(UserRole.Admin)), HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var account = await db.Accounts.FindAsync([id], ct);
        if (account is null) return NotFound();

        if (await db.Transactions.AnyAsync(t => t.AccountId == id || t.ToAccountId == id, ct))
            account.IsActive = false;
        else
            db.Accounts.Remove(account);

        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
