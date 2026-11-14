export type UserRole = 'Admin' | 'Member';
export type AccountType = 'Cash' | 'Bank' | 'MobileBanking' | 'Card' | 'Other';
export type CategoryType = 'Income' | 'Expense';
export type TransactionType = 'Income' | 'Expense' | 'Transfer';

export const ACCOUNT_TYPES: AccountType[] = ['Cash', 'Bank', 'MobileBanking', 'Card', 'Other'];

export const ACCOUNT_ICONS: Record<AccountType, string> = {
  Cash: '💵',
  Bank: '🏦',
  MobileBanking: '📱',
  Card: '💳',
  Other: '👛',
};

export interface User {
  id: number;
  name: string;
  username: string;
  role: UserRole;
  relation: string | null;
  isActive: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  openingBalance: number;
  balance: number;
  note: string | null;
  isActive: boolean;
}

export interface AccountSave {
  name: string;
  type: AccountType;
  openingBalance: number;
  note: string | null;
  isActive: boolean;
}

export interface Category {
  id: number;
  nameEn: string;
  nameBn: string;
  type: CategoryType;
  icon: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

export type CategorySave = Omit<Category, 'id'>;

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: number;
  date: string; // yyyy-MM-dd
  accountId: number;
  accountName: string;
  toAccountId: number | null;
  toAccountName: string | null;
  categoryId: number | null;
  categoryNameEn: string | null;
  categoryNameBn: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  memberId: number | null;
  memberName: string | null;
  note: string | null;
  createdById: number;
  createdByName: string;
  createdAt: string;
}

export interface TransactionSave {
  type: TransactionType;
  amount: number;
  date: string;
  accountId: number;
  toAccountId: number | null;
  categoryId: number | null;
  memberId: number | null;
  note: string | null;
}

export interface TransactionQuery {
  from?: string;
  to?: string;
  type?: TransactionType;
  accountId?: number;
  categoryId?: number;
  memberId?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
  totalIncome: number;
  totalExpense: number;
}

export interface UserSave {
  name: string;
  username?: string;
  password?: string;
  newPassword?: string | null;
  role: UserRole;
  relation: string | null;
  isActive?: boolean;
}

export interface CategoryTotal {
  categoryId: number | null;
  nameEn: string;
  nameBn: string;
  icon: string;
  color: string;
  amount: number;
}

export interface MemberTotal {
  memberId: number | null;
  name: string;
  amount: number;
}

export interface MonthTotal {
  year: number;
  month: number;
  income: number;
  expense: number;
}

export interface Dashboard {
  year: number;
  month: number;
  income: number;
  expense: number;
  net: number;
  totalBalance: number;
  accounts: Account[];
  expenseByCategory: CategoryTotal[];
  expenseByMember: MemberTotal[];
  trend: MonthTotal[];
  recent: Transaction[];
}

export interface Period {
  year: number;
  month: number;
}
