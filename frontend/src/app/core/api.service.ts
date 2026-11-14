import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { apiBaseUrl } from './config';
import {
  Account,
  AccountSave,
  Category,
  CategorySave,
  CategoryType,
  Dashboard,
  LoginResponse,
  Transaction,
  TransactionPage,
  TransactionQuery,
  TransactionSave,
  User,
  UserSave,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  /** Read on every call so a server address changed in the app applies immediately. */
  private get base(): string {
    return `${apiBaseUrl()}/api`;
  }

  // ---------- Auth ----------
  authStatus() {
    return this.http.get<{ needsSetup: boolean }>(`${this.base}/auth/status`);
  }
  setup(body: { name: string; username: string; password: string }) {
    return this.http.post<LoginResponse>(`${this.base}/auth/setup`, body);
  }
  login(body: { username: string; password: string }) {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, body);
  }
  me() {
    return this.http.get<User>(`${this.base}/auth/me`);
  }
  changePassword(body: { currentPassword: string; newPassword: string }) {
    return this.http.post<void>(`${this.base}/auth/change-password`, body);
  }

  // ---------- Users ----------
  users() {
    return this.http.get<User[]>(`${this.base}/users`);
  }
  createUser(body: UserSave) {
    return this.http.post<User>(`${this.base}/users`, body);
  }
  updateUser(id: number, body: UserSave) {
    return this.http.put<User>(`${this.base}/users/${id}`, body);
  }

  // ---------- Accounts ----------
  accounts() {
    return this.http.get<Account[]>(`${this.base}/accounts`);
  }
  createAccount(body: AccountSave) {
    return this.http.post<Account>(`${this.base}/accounts`, body);
  }
  updateAccount(id: number, body: AccountSave) {
    return this.http.put<Account>(`${this.base}/accounts/${id}`, body);
  }
  deleteAccount(id: number) {
    return this.http.delete<void>(`${this.base}/accounts/${id}`);
  }

  // ---------- Categories ----------
  categories(type?: CategoryType) {
    const params = type ? new HttpParams().set('type', type) : undefined;
    return this.http.get<Category[]>(`${this.base}/categories`, { params });
  }
  createCategory(body: CategorySave) {
    return this.http.post<Category>(`${this.base}/categories`, body);
  }
  updateCategory(id: number, body: CategorySave) {
    return this.http.put<Category>(`${this.base}/categories/${id}`, body);
  }
  deleteCategory(id: number) {
    return this.http.delete<void>(`${this.base}/categories/${id}`);
  }

  // ---------- Transactions ----------
  transactions(query: TransactionQuery) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<TransactionPage>(`${this.base}/transactions`, { params });
  }
  transaction(id: number) {
    return this.http.get<Transaction>(`${this.base}/transactions/${id}`);
  }
  createTransaction(body: TransactionSave) {
    return this.http.post<Transaction>(`${this.base}/transactions`, body);
  }
  updateTransaction(id: number, body: TransactionSave) {
    return this.http.put<Transaction>(`${this.base}/transactions/${id}`, body);
  }
  deleteTransaction(id: number) {
    return this.http.delete<void>(`${this.base}/transactions/${id}`);
  }

  // ---------- Dashboard ----------
  dashboard(year: number, month: number) {
    const params = new HttpParams().set('year', year).set('month', month);
    return this.http.get<Dashboard>(`${this.base}/dashboard`, { params });
  }
}
