-- =====================================================================
-- MoneyFlow — Many families in one project
-- Run once in Supabase → SQL Editor, after 003_projects.sql.
--
--   * Every row belongs to a family (families.id). Row Level Security only
--     shows a signed-in person the rows of their own family, so families
--     never see each other's data, even through the API directly.
--   * Sign-up either creates a new family (the person becomes its active
--     Admin and gets the default categories) or joins one with an invite
--     code (inactive until that family's admin approves them).
--   * The existing data is moved into one family ("আমার পরিবার"); its admin
--     can rename it in the app. Nothing is deleted.
--   * family_id is set by triggers, never by the app.
-- =====================================================================

-- All or nothing: if any statement fails, nothing is changed.
begin;

-- ---------------------------------------------------------------------
-- Families
-- ---------------------------------------------------------------------
-- 10 characters from an alphabet without look-alikes (no 0/O, 1/I/L).
create function public.new_family_code() returns text
language sql volatile set search_path = public as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 10);
$$;

create table public.families (
  id           bigint generated always as identity primary key,
  name         text not null check (char_length(name) between 1 and 100),
  invite_code  text not null unique default public.new_family_code(),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- family_id on every table; existing rows go to one family
-- ---------------------------------------------------------------------
alter table public.profiles     add column family_id bigint references public.families (id) on delete restrict;
alter table public.accounts     add column family_id bigint references public.families (id) on delete restrict;
alter table public.categories   add column family_id bigint references public.families (id) on delete restrict;
alter table public.transactions add column family_id bigint references public.families (id) on delete restrict;
alter table public.dues         add column family_id bigint references public.families (id) on delete restrict;
alter table public.projects     add column family_id bigint references public.families (id) on delete restrict;

do $$
declare
  fid bigint;
begin
  insert into public.families (name) values ('আমার পরিবার') returning id into fid;
  update public.profiles     set family_id = fid;
  update public.accounts     set family_id = fid;
  update public.categories   set family_id = fid;
  update public.transactions set family_id = fid;
  update public.dues         set family_id = fid;
  update public.projects     set family_id = fid;
end;
$$;

alter table public.profiles     alter column family_id set not null;
alter table public.accounts     alter column family_id set not null;
alter table public.categories   alter column family_id set not null;
alter table public.transactions alter column family_id set not null;
alter table public.dues         alter column family_id set not null;
alter table public.projects     alter column family_id set not null;

create index profiles_family_idx     on public.profiles (family_id);
create index accounts_family_idx     on public.accounts (family_id);
create index categories_family_idx   on public.categories (family_id);
create index transactions_family_idx on public.transactions (family_id, date desc);
create index dues_family_idx         on public.dues (family_id);
create index projects_family_idx     on public.projects (family_id);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
-- The signed-in person's family (null when not signed in).
create function public.my_family() returns bigint
language sql stable security definer set search_path = public as $$
  select family_id from public.profiles where id = auth.uid();
$$;

-- Default categories for a new family (same list as schema.sql).
create function public.seed_family_categories(p_family bigint) returns void
language sql security definer set search_path = public as $$
  insert into public.categories (family_id, type, name_en, name_bn, icon, color, sort_order) values
    (p_family, 'Expense', 'Groceries',         'বাজার',              '🛒', '#16a34a', 1),
    (p_family, 'Expense', 'House Rent',        'বাসা ভাড়া',          '🏠', '#9333ea', 2),
    (p_family, 'Expense', 'Utilities',         'বিদ্যুৎ/গ্যাস/পানি',   '💡', '#eab308', 3),
    (p_family, 'Expense', 'Education',         'শিক্ষা',             '📚', '#2563eb', 4),
    (p_family, 'Expense', 'Medical',           'চিকিৎসা',            '💊', '#dc2626', 5),
    (p_family, 'Expense', 'Transport',         'যাতায়াত',            '🚌', '#0891b2', 6),
    (p_family, 'Expense', 'Clothing',          'পোশাক',              '👕', '#db2777', 7),
    (p_family, 'Expense', 'Mobile & Internet', 'মোবাইল ও ইন্টারনেট',   '📱', '#4f46e5', 8),
    (p_family, 'Expense', 'Entertainment',     'বিনোদন',             '🎉', '#f97316', 9),
    (p_family, 'Expense', 'Gifts & Donation',  'উপহার ও দান',         '🎁', '#e11d48', 10),
    (p_family, 'Expense', 'Household',         'গৃহস্থালি',            '🧹', '#65a30d', 11),
    (p_family, 'Expense', 'Other Expense',     'অন্যান্য খরচ',        '📦', '#64748b', 99),
    (p_family, 'Income',  'Salary',            'বেতন',               '💼', '#16a34a', 1),
    (p_family, 'Income',  'Business',          'ব্যবসা',              '🏪', '#2563eb', 2),
    (p_family, 'Income',  'Rent Income',       'ভাড়া আয়',            '🏘️', '#9333ea', 3),
    (p_family, 'Income',  'Gift',              'উপহার',              '🎁', '#db2777', 4),
    (p_family, 'Income',  'Other Income',      'অন্যান্য আয়',         '💰', '#64748b', 99);
$$;

revoke execute on function public.seed_family_categories(bigint) from public, anon, authenticated;

-- Name of the family an invite code belongs to, or null. Callable before sign-up.
create function public.check_invite(p_code text) returns text
language sql stable security definer set search_path = public as $$
  select name from public.families where invite_code = upper(trim(p_code));
$$;

grant execute on function public.check_invite(text) to anon, authenticated;

-- Admin only: replaces the family's invite code (the old one stops working).
create function public.regenerate_invite_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  update public.families set invite_code = public.new_family_code()
  where id = public.my_family()
  returning invite_code into code;
  return code;
end;
$$;

revoke execute on function public.regenerate_invite_code() from anon;

-- ---------------------------------------------------------------------
-- Sign-up: create a family, or join one with an invite code
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code   text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_name   text := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 100);
  v_family bigint;
begin
  if v_code <> '' then
    select id into v_family from public.families where invite_code = v_code;
    if v_family is null then
      raise exception 'INVALID_INVITE';
    end if;
    insert into public.profiles (id, name, email, role, is_active, family_id)
    values (new.id, v_name, new.email, 'Member', false, v_family);
  else
    insert into public.families (name)
    values (left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'family_name'), ''), v_name), 100))
    returning id into v_family;
    insert into public.profiles (id, name, email, role, is_active, family_id)
    values (new.id, v_name, new.email, 'Admin', true, v_family);
    perform public.seed_family_categories(v_family);
  end if;
  return new;
end;
$$;

-- The family never changes, and the last active admin is counted per family.
create or replace function public.guard_profile_update() returns trigger
language plpgsql set search_path = public as $$
begin
  new.id := old.id;
  new.email := old.email;
  new.created_at := old.created_at;
  new.family_id := old.family_id;
  if old.role = 'Admin' and old.is_active and (new.role <> 'Admin' or not new.is_active)
     and not exists (select 1 from public.profiles
                     where id <> old.id and family_id = old.family_id and role = 'Admin' and is_active) then
    raise exception 'LAST_ADMIN';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- family_id is set by the server: the signed-in person's family on insert,
-- unchanged on update. (Without a signed-in user, e.g. inside the sign-up
-- trigger, the given family_id is kept.)
-- Trigger names start with "a_" so they run before the other BEFORE triggers.
-- ---------------------------------------------------------------------
create function public.set_family() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.family_id := old.family_id;
  elsif auth.uid() is not null then
    new.family_id := public.my_family();
    if new.family_id is null then
      raise exception 'FORBIDDEN';
    end if;
  end if;
  return new;
end;
$$;

create trigger a_family_set before insert or update on public.accounts
  for each row execute function public.set_family();
create trigger a_family_set before insert or update on public.categories
  for each row execute function public.set_family();
create trigger a_family_set before insert or update on public.dues
  for each row execute function public.set_family();
create trigger a_family_set before insert or update on public.projects
  for each row execute function public.set_family();

-- Entries also may only point at accounts, categories, projects and members of the same family.
create function public.set_family_transaction() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.family_id := old.family_id;
  elsif auth.uid() is not null then
    new.family_id := public.my_family();
    if new.family_id is null then
      raise exception 'FORBIDDEN';
    end if;
  end if;
  if not exists (select 1 from public.accounts where id = new.account_id and family_id = new.family_id)
     or (new.to_account_id is not null and not exists (
           select 1 from public.accounts where id = new.to_account_id and family_id = new.family_id))
     or (new.category_id is not null and not exists (
           select 1 from public.categories where id = new.category_id and family_id = new.family_id))
     or (new.project_id is not null and not exists (
           select 1 from public.projects where id = new.project_id and family_id = new.family_id))
     or (new.member_id is not null and not exists (
           select 1 from public.profiles where id = new.member_id and family_id = new.family_id)) then
    raise exception 'INVALID_REFERENCE';
  end if;
  return new;
end;
$$;

create trigger a_family_set before insert or update on public.transactions
  for each row execute function public.set_family_transaction();

-- ---------------------------------------------------------------------
-- Row Level Security: everything is limited to the person's own family
-- ---------------------------------------------------------------------
alter table public.families enable row level security;

create policy families_read on public.families
  for select to authenticated using (id = public.my_family());
create policy families_admin_update on public.families
  for update to authenticated
  using (id = public.my_family() and public.is_admin())
  with check (id = public.my_family() and public.is_admin());

revoke all on public.families from anon;

drop policy profiles_read on public.profiles;
drop policy profiles_admin_update on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or (public.is_member() and family_id = public.my_family()));
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin() and family_id = public.my_family())
  with check (public.is_admin() and family_id = public.my_family());

drop policy accounts_read on public.accounts;
drop policy accounts_admin_insert on public.accounts;
drop policy accounts_admin_update on public.accounts;
drop policy accounts_admin_delete on public.accounts;
create policy accounts_read on public.accounts
  for select to authenticated using (public.is_member() and family_id = public.my_family());
create policy accounts_admin_insert on public.accounts
  for insert to authenticated with check (public.is_admin() and family_id = public.my_family());
create policy accounts_admin_update on public.accounts
  for update to authenticated
  using (public.is_admin() and family_id = public.my_family())
  with check (public.is_admin() and family_id = public.my_family());
create policy accounts_admin_delete on public.accounts
  for delete to authenticated using (public.is_admin() and family_id = public.my_family());

drop policy categories_read on public.categories;
drop policy categories_admin_insert on public.categories;
drop policy categories_admin_update on public.categories;
drop policy categories_admin_delete on public.categories;
create policy categories_read on public.categories
  for select to authenticated using (public.is_member() and family_id = public.my_family());
create policy categories_admin_insert on public.categories
  for insert to authenticated with check (public.is_admin() and family_id = public.my_family());
create policy categories_admin_update on public.categories
  for update to authenticated
  using (public.is_admin() and family_id = public.my_family())
  with check (public.is_admin() and family_id = public.my_family());
create policy categories_admin_delete on public.categories
  for delete to authenticated using (public.is_admin() and family_id = public.my_family());

drop policy transactions_read on public.transactions;
drop policy transactions_insert on public.transactions;
drop policy transactions_update on public.transactions;
drop policy transactions_delete on public.transactions;
create policy transactions_read on public.transactions
  for select to authenticated using (public.is_member() and family_id = public.my_family());
create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (public.is_member() and family_id = public.my_family() and created_by = auth.uid());
create policy transactions_update on public.transactions
  for update to authenticated
  using (public.is_member() and family_id = public.my_family() and (public.is_admin() or created_by = auth.uid()))
  with check (public.is_member() and family_id = public.my_family() and (public.is_admin() or created_by = auth.uid()));
create policy transactions_delete on public.transactions
  for delete to authenticated
  using (public.is_member() and family_id = public.my_family() and (public.is_admin() or created_by = auth.uid()));

drop policy dues_read on public.dues;
drop policy dues_insert on public.dues;
drop policy dues_update on public.dues;
drop policy dues_delete on public.dues;
create policy dues_read on public.dues
  for select to authenticated using (public.is_member() and family_id = public.my_family());
create policy dues_insert on public.dues
  for insert to authenticated
  with check (public.is_member() and family_id = public.my_family() and created_by = auth.uid());
create policy dues_update on public.dues
  for update to authenticated
  using (public.is_member() and family_id = public.my_family() and (public.is_admin() or created_by = auth.uid()))
  with check (public.is_member() and family_id = public.my_family() and (public.is_admin() or created_by = auth.uid()));
create policy dues_delete on public.dues
  for delete to authenticated
  using (public.is_member() and family_id = public.my_family() and (public.is_admin() or created_by = auth.uid()));

drop policy projects_read on public.projects;
drop policy projects_insert on public.projects;
drop policy projects_update on public.projects;
drop policy projects_delete on public.projects;
create policy projects_read on public.projects
  for select to authenticated using (public.is_member() and family_id = public.my_family());
create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.is_member() and family_id = public.my_family() and created_by = auth.uid());
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_member() and family_id = public.my_family() and (public.is_admin() or created_by = auth.uid()))
  with check (public.is_member() and family_id = public.my_family() and (public.is_admin() or created_by = auth.uid()));
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.is_member() and family_id = public.my_family() and (public.is_admin() or created_by = auth.uid()));

-- Views (account_balances, transaction_details, project_totals) and functions
-- (dashboard, balance_summary, list/summary functions) run with the caller's
-- permissions, so the policies above already limit them to the caller's family.

commit;
