import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.service';
import { Shell } from './layout/shell';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage) },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage) },
      { path: 'transactions', loadComponent: () => import('./pages/transactions/transactions').then((m) => m.TransactionsPage) },
      { path: 'transactions/new', loadComponent: () => import('./pages/transaction-form/transaction-form').then((m) => m.TransactionFormPage) },
      { path: 'transactions/:id', loadComponent: () => import('./pages/transaction-form/transaction-form').then((m) => m.TransactionFormPage) },
      { path: 'dues', loadComponent: () => import('./pages/dues/dues').then((m) => m.DuesPage) },
      { path: 'accounts', loadComponent: () => import('./pages/accounts/accounts').then((m) => m.AccountsPage) },
      { path: 'categories', loadComponent: () => import('./pages/categories/categories').then((m) => m.CategoriesPage) },
      { path: 'members', loadComponent: () => import('./pages/members/members').then((m) => m.MembersPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.SettingsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
