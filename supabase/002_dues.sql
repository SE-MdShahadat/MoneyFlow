-- =====================================================================
-- MoneyFlow — Dues (Receivable / Payable)
-- Run once in Supabase → SQL Editor, after schema.sql.
--   Receivable: money other people owe the family (পাওনা).
--   Payable:    money the family owes others (দেনা).
-- Same permissions as entries: members read and add; the author or an admin edits/deletes.
-- =====================================================================

create table public.dues (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('Receivable', 'Payable')),
  person      text not null check (char_length(person) between 1 and 100),
  amount      numeric(18, 2) not null check (amount >= 0),
  note        text check (note is null or char_length(note) <= 500),
  is_settled  boolean not null default false,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index dues_kind_idx on public.dues (kind, is_settled);

create function public.prepare_due() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    new.updated_at := null;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger dues_prepare
  before insert or update on public.dues
  for each row execute function public.prepare_due();

alter table public.dues enable row level security;

create policy dues_read on public.dues
  for select to authenticated using (public.is_member());
create policy dues_insert on public.dues
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy dues_update on public.dues
  for update to authenticated
  using (public.is_member() and (public.is_admin() or created_by = auth.uid()))
  with check (public.is_member() and (public.is_admin() or created_by = auth.uid()));
create policy dues_delete on public.dues
  for delete to authenticated
  using (public.is_member() and (public.is_admin() or created_by = auth.uid()));

revoke all on public.dues from anon;

-- Totals shown on the Transactions page.
--   balance  = money in all active accounts right now
--   actual   = balance + receivable − payable
create function public.balance_summary()
returns jsonb
language sql stable set search_path = public as $$
  with s as (
    select
      coalesce((select sum(balance) from public.account_balances where is_active), 0) as balance,
      coalesce((select sum(amount) from public.dues where kind = 'Receivable' and not is_settled), 0) as receivable,
      coalesce((select sum(amount) from public.dues where kind = 'Payable' and not is_settled), 0) as payable)
  select jsonb_build_object(
    'balance', balance,
    'receivable', receivable,
    'payable', payable,
    'actual', balance + receivable - payable)
  from s;
$$;

revoke execute on function public.balance_summary from anon;
