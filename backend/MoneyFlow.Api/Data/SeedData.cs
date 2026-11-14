using MoneyFlow.Api.Models;

namespace MoneyFlow.Api.Data;

/// <summary>Default categories created by the initial migration. Admins can edit or add more later.</summary>
public static class SeedData
{
    public static readonly Category[] Categories =
    [
        // Expense
        new() { Id = 1,  Type = CategoryType.Expense, NameEn = "Groceries",          NameBn = "বাজার",            Icon = "🛒", Color = "#16a34a", SortOrder = 1 },
        new() { Id = 2,  Type = CategoryType.Expense, NameEn = "House Rent",         NameBn = "বাসা ভাড়া",        Icon = "🏠", Color = "#9333ea", SortOrder = 2 },
        new() { Id = 3,  Type = CategoryType.Expense, NameEn = "Utilities",          NameBn = "বিদ্যুৎ/গ্যাস/পানি", Icon = "💡", Color = "#eab308", SortOrder = 3 },
        new() { Id = 4,  Type = CategoryType.Expense, NameEn = "Education",          NameBn = "শিক্ষা",           Icon = "📚", Color = "#2563eb", SortOrder = 4 },
        new() { Id = 5,  Type = CategoryType.Expense, NameEn = "Medical",            NameBn = "চিকিৎসা",          Icon = "💊", Color = "#dc2626", SortOrder = 5 },
        new() { Id = 6,  Type = CategoryType.Expense, NameEn = "Transport",          NameBn = "যাতায়াত",          Icon = "🚌", Color = "#0891b2", SortOrder = 6 },
        new() { Id = 7,  Type = CategoryType.Expense, NameEn = "Clothing",           NameBn = "পোশাক",            Icon = "👕", Color = "#db2777", SortOrder = 7 },
        new() { Id = 8,  Type = CategoryType.Expense, NameEn = "Mobile & Internet",  NameBn = "মোবাইল ও ইন্টারনেট", Icon = "📱", Color = "#4f46e5", SortOrder = 8 },
        new() { Id = 9,  Type = CategoryType.Expense, NameEn = "Entertainment",      NameBn = "বিনোদন",           Icon = "🎉", Color = "#f97316", SortOrder = 9 },
        new() { Id = 10, Type = CategoryType.Expense, NameEn = "Gifts & Donation",   NameBn = "উপহার ও দান",       Icon = "🎁", Color = "#e11d48", SortOrder = 10 },
        new() { Id = 11, Type = CategoryType.Expense, NameEn = "Household",          NameBn = "গৃহস্থালি",          Icon = "🧹", Color = "#65a30d", SortOrder = 11 },
        new() { Id = 12, Type = CategoryType.Expense, NameEn = "Other Expense",      NameBn = "অন্যান্য খরচ",      Icon = "📦", Color = "#64748b", SortOrder = 99 },

        // Income
        new() { Id = 101, Type = CategoryType.Income, NameEn = "Salary",       NameBn = "বেতন",        Icon = "💼", Color = "#16a34a", SortOrder = 1 },
        new() { Id = 102, Type = CategoryType.Income, NameEn = "Business",     NameBn = "ব্যবসা",       Icon = "🏪", Color = "#2563eb", SortOrder = 2 },
        new() { Id = 103, Type = CategoryType.Income, NameEn = "Rent Income",  NameBn = "ভাড়া আয়",     Icon = "🏘️", Color = "#9333ea", SortOrder = 3 },
        new() { Id = 104, Type = CategoryType.Income, NameEn = "Gift",         NameBn = "উপহার",        Icon = "🎁", Color = "#db2777", SortOrder = 4 },
        new() { Id = 105, Type = CategoryType.Income, NameEn = "Other Income", NameBn = "অন্যান্য আয়",  Icon = "💰", Color = "#64748b", SortOrder = 99 },
    ];
}
