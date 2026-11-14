import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { supabase } from './config';
import { toAccount, toCategory, toDue, toTransaction, toUser } from './mappers';
import {
  Account,
  AccountSave,
  BalanceSummary,
  Due,
  DueSave,
  Category,
  CategorySave,
  CategoryType,
  Dashboard,
  Transaction,
  TransactionPage,
  TransactionQuery,
  TransactionSave,
  User,
  UserSave,
} from './models';

/** Error with a code the UI translates (see `err.*` keys in translations.ts). */
export class AppError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

interface DbResult<T> {
  data: T | null;
  error: unknown;
}

async function unwrap<T>(query: PromiseLike<DbResult<T>>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data as T;
}

/**
 * Updates/deletes blocked by Row Level Security do not error, they just touch 0 rows.
 * Asking for the changed ids back turns that into a clear "not allowed".
 */
async function changedOne(query: PromiseLike<DbResult<unknown[]>>): Promise<void> {
  const rows = await unwrap(query);
  if (!rows || rows.length === 0) throw new AppError('FORBIDDEN');
}

const db = () => supabase();

/** All data access. Every method returns an Observable so pages can `.subscribe()`. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  // ---------- Members ----------
  users(): Observable<User[]> {
    return from(
      unwrap(db().from('profiles').select('*').order('is_active', { ascending: true }).order('name')).then((rows) =>
        (rows as Record<string, unknown>[]).map(toUser),
      ),
    );
  }

  updateUser(id: string, body: UserSave): Observable<User> {
    return from(
      (async () => {
        const rows = await unwrap(
          db()
            .from('profiles')
            .update({ name: body.name.trim(), role: body.role, relation: body.relation, is_active: body.isActive })
            .eq('id', id)
            .select('*'),
        );
        if (!rows?.length) throw new AppError('FORBIDDEN');
        return toUser(rows[0]);
      })(),
    );
  }

  // ---------- Accounts ----------
  accounts(): Observable<Account[]> {
    return from(
      unwrap(db().from('account_balances').select('*').order('is_active', { ascending: false }).order('name')).then(
        (rows) => (rows as Record<string, unknown>[]).map(toAccount),
      ),
    );
  }

  createAccount(body: AccountSave): Observable<void> {
    return from(unwrap(db().from('accounts').insert(accountRow(body))).then(() => undefined));
  }

  updateAccount(id: number, body: AccountSave): Observable<void> {
    return from(changedOne(db().from('accounts').update(accountRow(body)).eq('id', id).select('id')));
  }

  /** Deletes an unused account; one with entries is deactivated instead, so history stays intact. */
  deleteAccount(id: number): Observable<void> {
    return from(deleteOrDeactivate('accounts', id));
  }

  // ---------- Categories ----------
  categories(type?: CategoryType): Observable<Category[]> {
    let q = db().from('categories').select('*');
    if (type) q = q.eq('type', type);
    return from(
      unwrap(q.order('type').order('sort_order').order('name_en')).then((rows) =>
        (rows as Record<string, unknown>[]).map(toCategory),
      ),
    );
  }

  createCategory(body: CategorySave): Observable<void> {
    return from(unwrap(db().from('categories').insert(categoryRow(body))).then(() => undefined));
  }

  updateCategory(id: number, body: CategorySave): Observable<void> {
    return from(
      (async () => {
        const current = (await unwrap(db().from('categories').select('type').eq('id', id).single())) as unknown as {
          type: string;
        };
        if (current.type !== body.type) {
          const used = await unwrap(db().from('transactions').select('id').eq('category_id', id).limit(1));
          if (used?.length) throw new AppError('CATEGORY_IN_USE');
        }
        await changedOne(db().from('categories').update(categoryRow(body)).eq('id', id).select('id'));
      })(),
    );
  }

  deleteCategory(id: number): Observable<void> {
    return from(deleteOrDeactivate('categories', id));
  }

  // ---------- Transactions ----------
  transactions(q: TransactionQuery): Observable<TransactionPage> {
    const pageSize = q.pageSize ?? 50;
    const page = q.page ?? 1;
    const filters = {
      p_from: q.from,
      p_to: q.to,
      p_type: q.type ?? null,
      p_account: q.accountId ?? null,
      p_member: q.memberId ?? null,
      p_search: q.search?.trim() || null,
    };
    return from(
      (async () => {
        const [rows, summary] = await Promise.all([
          unwrap(db().rpc('list_transactions', { ...filters, p_limit: pageSize, p_offset: (page - 1) * pageSize })),
          unwrap(db().rpc('transaction_summary', filters)),
        ]);
        const s = (summary as { total: number; income: number; expense: number }[])[0];
        return {
          items: (rows as Record<string, unknown>[]).map(toTransaction),
          total: Number(s?.total ?? 0),
          totalIncome: Number(s?.income ?? 0),
          totalExpense: Number(s?.expense ?? 0),
        };
      })(),
    );
  }

  transaction(id: number): Observable<Transaction> {
    return from(
      (async () => {
        const row = await unwrap(db().from('transaction_details').select('*').eq('id', id).maybeSingle());
        if (!row) throw new AppError('NOT_FOUND');
        return toTransaction(row);
      })(),
    );
  }

  createTransaction(body: TransactionSave): Observable<void> {
    return from(unwrap(db().from('transactions').insert(transactionRow(body))).then(() => undefined));
  }

  updateTransaction(id: number, body: TransactionSave): Observable<void> {
    return from(changedOne(db().from('transactions').update(transactionRow(body)).eq('id', id).select('id')));
  }

  deleteTransaction(id: number): Observable<void> {
    return from(changedOne(db().from('transactions').delete().eq('id', id).select('id')));
  }

  /**
   * Deletes several entries at once (e.g. one day's list). Returns how many were really deleted:
   * rows a member may not delete (someone else's) are silently skipped by Row Level Security.
   */
  deleteTransactions(ids: number[]): Observable<number> {
    return from(
      unwrap(db().from('transactions').delete().in('id', ids).select('id')).then((rows) => rows?.length ?? 0),
    );
  }

  // ---------- Dues (Receivable / Payable) ----------
  dues(): Observable<Due[]> {
    return from(
      unwrap(db().from('dues').select('*').order('is_settled').order('amount', { ascending: false })).then((rows) =>
        (rows as Record<string, unknown>[]).map(toDue),
      ),
    );
  }

  createDue(body: DueSave): Observable<void> {
    return from(unwrap(db().from('dues').insert(dueRow(body))).then(() => undefined));
  }

  updateDue(id: number, body: DueSave): Observable<void> {
    return from(changedOne(db().from('dues').update(dueRow(body)).eq('id', id).select('id')));
  }

  deleteDue(id: number): Observable<void> {
    return from(changedOne(db().from('dues').delete().eq('id', id).select('id')));
  }

  /** Account total, open receivables/payables and the "actual" balance (balance + receivable − payable). */
  balanceSummary(): Observable<BalanceSummary> {
    return from(
      unwrap(db().rpc('balance_summary')).then((raw) => {
        const s = (raw ?? {}) as Partial<BalanceSummary>;
        return {
          balance: Number(s.balance ?? 0),
          receivable: Number(s.receivable ?? 0),
          payable: Number(s.payable ?? 0),
          actual: Number(s.actual ?? 0),
        };
      }),
    );
  }

  // ---------- Dashboard ----------
  dashboard(year: number, month: number): Observable<Dashboard> {
    return from(
      unwrap(db().rpc('dashboard', { p_year: year, p_month: month })).then((raw) => {
        const d = raw as Dashboard & { recent: Record<string, unknown>[] };
        return { ...d, recent: d.recent.map(toTransaction) };
      }),
    );
  }
}

function accountRow(b: AccountSave) {
  return {
    name: b.name.trim(),
    type: b.type,
    opening_balance: Number(b.openingBalance) || 0,
    note: b.note?.trim() || null,
    is_active: b.isActive,
  };
}

function categoryRow(b: CategorySave) {
  return {
    name_en: b.nameEn.trim(),
    name_bn: b.nameBn.trim(),
    type: b.type,
    icon: b.icon?.trim() || '📦',
    color: b.color?.trim() || '#64748b',
    sort_order: Number(b.sortOrder) || 0,
    is_active: b.isActive,
  };
}

function dueRow(b: DueSave) {
  return {
    kind: b.kind,
    person: b.person.trim(),
    amount: Math.round((Number(b.amount) || 0) * 100) / 100,
    note: b.note?.trim() || null,
    is_settled: b.isSettled,
  };
}

function transactionRow(b: TransactionSave) {
  const transfer = b.type === 'Transfer';
  return {
    type: b.type,
    amount: Math.round(b.amount * 100) / 100,
    date: b.date,
    account_id: b.accountId,
    to_account_id: transfer ? b.toAccountId : null,
    category_id: transfer ? null : b.categoryId,
    member_id: b.memberId,
    note: b.note?.trim() || null,
  };
}

async function deleteOrDeactivate(table: 'accounts' | 'categories', id: number): Promise<void> {
  const { data, error } = await db().from(table).delete().eq('id', id).select('id');
  if (!error) {
    if (!data?.length) throw new AppError('FORBIDDEN');
    return;
  }
  // 23503 = still referenced by transactions → keep it, just hide it.
  if ((error as { code?: string }).code !== '23503') throw error;
  await changedOne(db().from(table).update({ is_active: false }).eq('id', id).select('id'));
}
