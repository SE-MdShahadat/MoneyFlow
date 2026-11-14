import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AppError } from './api.service';
import { supabase } from './config';
import { toUser } from './mappers';
import { User } from './models';

/** Who is signed in. Sign-in itself is handled by Supabase Auth (email + password). */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  private readonly _user = signal<User | null>(null);
  readonly user = this._user.asReadonly();
  /** Signed in AND approved by an admin. */
  readonly isLoggedIn = computed(() => !!this._user()?.isActive);
  readonly isAdmin = computed(() => this.isLoggedIn() && this._user()?.role === 'Admin');

  /** Resolves once a saved session (if any) has been restored. Guards wait on it. */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.restore();
    supabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') this._user.set(null);
    });
  }

  private async restore(): Promise<void> {
    try {
      const { data } = await supabase().auth.getSession();
      if (data.session) await this.loadProfile(data.session.user.id);
    } catch {
      this._user.set(null);
    }
  }

  private async loadProfile(id: string): Promise<User | null> {
    const { data, error } = await supabase().from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    const user = data ? toUser(data) : null;
    this._user.set(user);
    return user;
  }

  /** Returns the profile; `isActive` false means the account still waits for admin approval. */
  async signIn(email: string, password: string): Promise<User | null> {
    const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    return this.loadProfile(data.user.id);
  }

  /** Creates a login. The first one in a new database becomes the admin; later ones wait for approval. */
  async signUp(name: string, email: string, password: string): Promise<User | null> {
    const { data, error } = await supabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) throw error;
    if (!data.session || !data.user) throw new AppError('CONFIRM_EMAIL');
    return this.loadProfile(data.user.id);
  }

  async changePassword(current: string, next: string): Promise<void> {
    const email = this._user()?.email;
    if (!email) throw new AppError('FORBIDDEN');
    const check = await supabase().auth.signInWithPassword({ email, password: current });
    if (check.error) throw new AppError('WRONG_PASSWORD');
    const { error } = await supabase().auth.updateUser({ password: next });
    if (error) throw error;
  }

  updateUser(user: User): void {
    this._user.set(user);
  }

  /** Signs out without leaving the page (used when an account is not approved yet). */
  async signOutQuietly(): Promise<void> {
    await supabase().auth.signOut();
    this._user.set(null);
  }

  async logout(): Promise<void> {
    await this.signOutQuietly();
    this.router.navigate(['/login']);
  }
}

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.isLoggedIn() ? router.createUrlTree(['/']) : true;
};
