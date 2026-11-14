using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MoneyFlow.Api.Data;
using MoneyFlow.Api.Services;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ---------- Database ----------
// Change "ConnectionStrings:MoneyFlowDb" in appsettings.json, or set the environment variable
// ConnectionStrings__MoneyFlowDb, to point the app at a different SQL Server.
var connectionString = config.GetConnectionString("MoneyFlowDb")
    ?? throw new InvalidOperationException("Connection string 'MoneyFlowDb' is missing in appsettings.json.");
builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlServer(connectionString));

// ---------- Auth (JWT) ----------
var jwt = new JwtSettings(
    JwtKeyProvider.GetOrCreate(config, builder.Environment),
    config["Jwt:Issuer"] ?? "MoneyFlow",
    config.GetValue("Jwt:ExpiryDays", 30));
builder.Services.AddSingleton(jwt);
builder.Services.AddScoped<TokenService>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = false,
            ValidateLifetime = true,
            IssuerSigningKey = new SymmetricSecurityKey(jwt.KeyBytes),
            NameClaimType = "name",
            RoleClaimType = "role",
        };
    });
builder.Services.AddAuthorization();

// ---------- API ----------
builder.Services
    .AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddOpenApi();

// Only needed when the frontend is served from another origin (e.g. GitHub Pages or `ng serve`).
var corsOrigins = config.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Create / upgrade the database on startup.
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// The built Angular app is copied into wwwroot, so one process serves both UI and API.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
