import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { storageGet, storageSet } from './config';
import { LoginResponse, User } from './models';

const TOKEN_KEY = 'mf.token';
const USER_KEY = 'mf.user';

function tokenIsValid(token: string | null): token is string {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp !== 'number' || payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function readUser(): User | null {
  try {
    const raw = storageGet(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  private readonly _token = signal<string | null>(tokenIsValid(storageGet(TOKEN_KEY)) ? storageGet(TOKEN_KEY) : null);
  private readonly _user = signal<User | null>(this._token() ? readUser() : null);

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token() && !!this._user());
  readonly isAdmin = computed(() => this._user()?.role === 'Admin');

  setSession(res: LoginResponse): void {
    this._token.set(res.token);
    this._user.set(res.user);
    storageSet(TOKEN_KEY, res.token);
    storageSet(USER_KEY, JSON.stringify(res.user));
  }

  updateUser(user: User): void {
    this._user.set(user);
    storageSet(USER_KEY, JSON.stringify(user));
  }

  logout(): void {
    this._token.set(null);
    this._user.set(null);
    storageSet(TOKEN_KEY, null);
    storageSet(USER_KEY, null);
    this.router.navigate(['/login']);
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && token) auth.logout();
      return throwError(() => err);
    }),
  );
};

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).createUrlTree(['/']) : true;
};
