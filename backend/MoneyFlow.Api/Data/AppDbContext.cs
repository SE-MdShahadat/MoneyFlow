using Microsoft.EntityFrameworkCore;
using MoneyFlow.Api.Models;

namespace MoneyFlow.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Transaction> Transactions => Set<Transaction>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100);
            e.Property(x => x.Username).HasMaxLength(50);
            e.Property(x => x.PasswordHash).HasMaxLength(200);
            e.Property(x => x.Relation).HasMaxLength(50);
            e.Property(x => x.Role).HasConversion<string>().HasMaxLength(20);
            e.HasIndex(x => x.Username).IsUnique();
        });

        b.Entity<Account>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100);
            e.Property(x => x.Note).HasMaxLength(500);
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.OpeningBalance).HasPrecision(18, 2);
        });

        b.Entity<Category>(e =>
        {
            e.Property(x => x.NameEn).HasMaxLength(100);
            e.Property(x => x.NameBn).HasMaxLength(100);
            e.Property(x => x.Icon).HasMaxLength(20);
            e.Property(x => x.Color).HasMaxLength(20);
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
            e.HasData(SeedData.Categories);
        });

        b.Entity<Transaction>(e =>
        {
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasIndex(x => x.Date);

            // Restrict everywhere: SQL Server rejects multiple cascade paths, and history must not vanish.
            e.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ToAccount).WithMany().HasForeignKey(x => x.ToAccountId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Member).WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
