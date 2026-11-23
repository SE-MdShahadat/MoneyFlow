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

/** A family member (Supabase auth user + profile). `isActive` is false until an admin approves them. */
export interface User {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  relation: string | null;
  isActive: boolean;
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
  memberId: string | null;
  memberName: string | null;
  note: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  projectId: number | null;
  projectName: string | null;
  quantity: number | null;
  unit: string | null;
}

export interface TransactionSave {
  type: TransactionType;
  amount: number;
  date: string;
  accountId: number;
  toAccountId: number | null;
  categoryId: number | null;
  memberId: string | null;
  note: string | null;
  /** undefined = projects are not available, so the project columns are not sent at all. */
  projectId?: number | null;
  quantity?: number | null;
  unit?: string | null;
}

export interface TransactionQuery {
  from: string;
  to: string;
  type?: TransactionType;
  accountId?: number;
  memberId?: string;
  search?: string;
  projectId?: number;
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
  role: UserRole;
  relation: string | null;
  isActive: boolean;
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
  memberId: string | null;
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

export type DueKind = 'Receivable' | 'Payable';

/** Money someone owes the family (Receivable) or the family owes someone (Payable). */
export interface Due {
  id: number;
  kind: DueKind;
  person: string;
  amount: number;
  note: string | null;
  isSettled: boolean;
  createdById: string;
}

export type DueSave = Omit<Due, 'id' | 'createdById'>;

export interface BalanceSummary {
  balance: number;
  receivable: number;
  payable: number;
  actual: number;
}

export interface Period {
  year: number;
  month: number;
}

/** A separate tally (e.g. house construction) that entries can be tagged with. Totals come from the database. */
export interface Project {
  id: number;
  name: string;
  budget: number | null;
  note: string | null;
  isDone: boolean;
  createdById: string;
  expense: number;
  income: number;
  entries: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface ProjectSave {
  name: string;
  budget: number | null;
  note: string | null;
  isDone: boolean;
}
