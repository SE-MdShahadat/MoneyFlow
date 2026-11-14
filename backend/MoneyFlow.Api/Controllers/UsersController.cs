using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MoneyFlow.Api.Data;
using MoneyFlow.Api.Dtos;
using MoneyFlow.Api.Models;

namespace MoneyFlow.Api.Controllers;

/// <summary>Family members. Everyone can list them (for the "member" picker); only Admins change them.</summary>
public class UsersController(AppDbContext db) : ApiControllerBase
{
    internal static UserDto ToDto(User u) => new(u.Id, u.Name, u.Username, u.Role, u.Relation, u.IsActive);

    [HttpGet]
    public async Task<IEnumerable<UserDto>> List(CancellationToken ct) =>
        (await db.Users.OrderBy(u => u.Name).ToListAsync(ct)).Select(ToDto);

    [Authorize(Roles = nameof(UserRole.Admin)), HttpPost]
    public async Task<ActionResult<UserDto>> Create(UserCreateRequest req, CancellationToken ct)
    {
        var username = req.Username.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Username == username, ct))
            return Error(409, "USERNAME_TAKEN", "This username is already used.");

        var user = new User
        {
            Name = req.Name.Trim(),
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = req.Role,
            Relation = req.Relation?.Trim(),
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        return ToDto(user);
    }

    [Authorize(Roles = nameof(UserRole.Admin)), HttpPut("{id:int}")]
    public async Task<ActionResult<UserDto>> Update(int id, UserUpdateRequest req, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([id], ct);
        if (user is null) return NotFound();

        // Never let the family lose its last active admin.
        var losesAdmin = user.Role == UserRole.Admin && user.IsActive && (req.Role != UserRole.Admin || !req.IsActive);
        if (losesAdmin && !await db.Users.AnyAsync(u => u.Id != id && u.Role == UserRole.Admin && u.IsActive, ct))
            return BadRequestError("LAST_ADMIN", "At least one active admin is required.");

        user.Name = req.Name.Trim();
        user.Role = req.Role;
        user.Relation = req.Relation?.Trim();
        user.IsActive = req.IsActive;
        if (!string.IsNullOrWhiteSpace(req.NewPassword))
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);

        await db.SaveChangesAsync(ct);
        return ToDto(user);
    }
}
