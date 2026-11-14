using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MoneyFlow.Api.Dtos;
using MoneyFlow.Api.Models;

namespace MoneyFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public abstract class ApiControllerBase : ControllerBase
{
    protected int CurrentUserId => int.Parse(User.FindFirst("sub")!.Value);

    protected bool IsAdmin => User.IsInRole(nameof(UserRole.Admin));

    protected ObjectResult Error(int status, string code, string message) =>
        StatusCode(status, new ApiError(code, message));

    protected ObjectResult BadRequestError(string code, string message) => Error(400, code, message);
}
