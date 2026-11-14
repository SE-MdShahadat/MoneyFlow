using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MoneyFlow.Api.Data;
using MoneyFlow.Api.Dtos;
using MoneyFlow.Api.Models;
using MoneyFlow.Api.Services;

namespace MoneyFlow.Api.Controllers;

public class AuthController(AppDbContext db, TokenService tokens) : ApiControllerBase
{
    /// <summary>True until the first (admin) user has been created.</summary>
    [AllowAnonymous, HttpGet("status")]
    public async Task<AuthStatusDto> Status(CancellationToken ct) =>
        new(!await db.Users.AnyAsync(ct));

    /// <summary>One-time setup: creates the first Admin. Refused once any user exists.</summary>
    [AllowAnonymous, HttpPost("setup")]
    public async Task<ActionResult<LoginResponse>> Setup(SetupRequest req, CancellationToken ct)
    {
        if (await db.Users.AnyAsync(ct))
            return Error(409, "SETUP_DONE", "Setup has already been completed.");

        var user = new User
        {
            Name = req.Name.Trim(),
            Username = req.Username.Trim().ToLowerInvariant(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = UserRole.Admin,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        return new LoginResponse(tokens.Create(user), UsersController.ToDto(user));
    }

    [AllowAnonymous, HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest req, CancellationToken ct)
    {
        var username = req.Username.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username, ct);
        if (user is null || !user.IsActive || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Error(401, "INVALID_LOGIN", "Wrong username or password.");

        return new LoginResponse(tokens.Create(user), UsersController.ToDto(user));
    }

    [HttpGet("me")]
    public async Task<ActionResult<UserDto>> Me(CancellationToken ct)
    {
        var user = await db.Users.FindAsync([CurrentUserId], ct);
        if (user is null || !user.IsActive) return Unauthorized();
        return UsersController.ToDto(user);
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest req, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([CurrentUserId], ct);
        if (user is null) return Unauthorized();
        if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
            return BadRequestError("WRONG_PASSWORD", "Current password is wrong.");

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
