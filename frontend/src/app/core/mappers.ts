import { Account, Category, Transaction, User } from './models';

/* Database rows use snake_case; the app uses camelCase. These turn one into the other. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export function toUser(p: Row): User {
  return {
    id: p['id'],
    name: p['name'],
    email: p['email'] ?? null,
    role: p['role'],
    relation: p['relation'] ?? null,
    isActive: !!p['is_active'],
  };
}

export function toAccount(a: Row): Account {
  return {
    id: a['id'],
    name: a['name'],
    type: a['type'],
    openingBalance: Number(a['opening_balance'] ?? 0),
    balance: Number(a['balance'] ?? 0),
    note: a['note'] ?? null,
    isActive: !!a['is_active'],
  };
}

export function toCategory(c: Row): Category {
  return {
    id: c['id'],
    nameEn: c['name_en'],
    nameBn: c['name_bn'],
    type: c['type'],
    icon: c['icon'],
    color: c['color'],
    sortOrder: c['sort_order'],
    isActive: !!c['is_active'],
  };
}

export function toTransaction(d: Row): Transaction {
  return {
    id: d['id'],
    type: d['type'],
    amount: Number(d['amount']),
    date: d['date'],
    accountId: d['account_id'],
    accountName: d['account_name'],
    toAccountId: d['to_account_id'] ?? null,
    toAccountName: d['to_account_name'] ?? null,
    categoryId: d['category_id'] ?? null,
    categoryNameEn: d['category_name_en'] ?? null,
    categoryNameBn: d['category_name_bn'] ?? null,
    categoryIcon: d['category_icon'] ?? null,
    categoryColor: d['category_color'] ?? null,
    memberId: d['member_id'] ?? null,
    memberName: d['member_name'] ?? null,
    note: d['note'] ?? null,
    createdById: d['created_by'],
    createdByName: d['created_by_name'] ?? '',
    createdAt: d['created_at'],
  };
}
