using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using MoneyFlow.Api.Models;

namespace MoneyFlow.Api.Services;

public record JwtSettings(byte[] KeyBytes, string Issuer, int ExpiryDays);

public class TokenService(JwtSettings settings)
{
    public string Create(User user)
    {
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = settings.Issuer,
            Expires = DateTime.UtcNow.AddDays(settings.ExpiryDays),
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(settings.KeyBytes), SecurityAlgorithms.HmacSha256),
            Claims = new Dictionary<string, object>
            {
                ["sub"] = user.Id.ToString(),
                ["name"] = user.Name,
                ["username"] = user.Username,
                ["role"] = user.Role.ToString(),
            }
        };
        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}

public static class JwtKeyProvider
{
    /// <summary>
    /// Uses <c>Jwt:Key</c> from configuration when set (recommended for any shared/cloud host).
    /// Otherwise generates a random key once and keeps it in App_Data/jwt.key (git-ignored),
    /// so a fresh clone works without committing a secret.
    /// </summary>
    public static byte[] GetOrCreate(IConfiguration config, IHostEnvironment env)
    {
        var configured = config["Jwt:Key"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            var bytes = System.Text.Encoding.UTF8.GetBytes(configured);
            if (bytes.Length < 32)
                throw new InvalidOperationException("Jwt:Key must be at least 32 characters.");
            return bytes;
        }

        var dir = Path.Combine(env.ContentRootPath, "App_Data");
        var path = Path.Combine(dir, "jwt.key");
        if (File.Exists(path))
            return Convert.FromBase64String(File.ReadAllText(path).Trim());

        Directory.CreateDirectory(dir);
        var key = RandomNumberGenerator.GetBytes(64);
        File.WriteAllText(path, Convert.ToBase64String(key));
        return key;
    }
}
