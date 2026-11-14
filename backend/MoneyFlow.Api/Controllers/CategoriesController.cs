using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MoneyFlow.Api.Data;
using MoneyFlow.Api.Dtos;
using MoneyFlow.Api.Models;

namespace MoneyFlow.Api.Controllers;

public class CategoriesController(AppDbContext db) : ApiControllerBase
{
    private static CategoryDto ToDto(Category c) => new(c.Id, c.NameEn, c.NameBn, c.Type, c.Icon, c.Color, c.SortOrder, c.IsActive);

    [HttpGet]
    public async Task<IEnumerable<CategoryDto>> List([FromQuery] CategoryType? type, CancellationToken ct)
    {
        var query = db.Categories.AsQueryable();
        if (type is not null) query = query.Where(c => c.Type == type);
        var list = await query.OrderBy(c => c.Type).ThenBy(c => c.SortOrder).ThenBy(c => c.NameEn).ToListAsync(ct);
        return list.Select(ToDto);
    }

    [Authorize(Roles = nameof(UserRole.Admin)), HttpPost]
    public async Task<ActionResult<CategoryDto>> Create(CategorySaveRequest req, CancellationToken ct)
    {
        var category = new Category { NameEn = "", NameBn = "" };
        Apply(category, req);
        db.Categories.Add(category);
        await db.SaveChangesAsync(ct);
        return ToDto(category);
    }

    [Authorize(Roles = nameof(UserRole.Admin)), HttpPut("{id:int}")]
    public async Task<ActionResult<CategoryDto>> Update(int id, CategorySaveRequest req, CancellationToken ct)
    {
        var category = await db.Categories.FindAsync([id], ct);
        if (category is null) return NotFound();

        if (category.Type != req.Type && await db.Transactions.AnyAsync(t => t.CategoryId == id, ct))
            return BadRequestError("CATEGORY_IN_USE", "Type cannot change while transactions use this category.");

        Apply(category, req);
        await db.SaveChangesAsync(ct);
        return ToDto(category);
    }

    /// <summary>Deletes an unused category; a category with history is only deactivated.</summary>
    [Authorize(Roles = nameof(UserRole.Admin)), HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var category = await db.Categories.FindAsync([id], ct);
        if (category is null) return NotFound();

        if (await db.Transactions.AnyAsync(t => t.CategoryId == id, ct))
            category.IsActive = false;
        else
            db.Categories.Remove(category);

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static void Apply(Category c, CategorySaveRequest req)
    {
        c.NameEn = req.NameEn.Trim();
        c.NameBn = req.NameBn.Trim();
        c.Type = req.Type;
        c.Icon = string.IsNullOrWhiteSpace(req.Icon) ? "📦" : req.Icon.Trim();
        c.Color = string.IsNullOrWhiteSpace(req.Color) ? "#64748b" : req.Color.Trim();
        c.SortOrder = req.SortOrder;
        c.IsActive = req.IsActive;
    }
}
