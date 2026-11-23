-- =====================================================================
-- MoneyFlow — Projects (প্রকল্প)
-- Run once in Supabase → SQL Editor, after schema.sql and 002_dues.sql.
--   A project (e.g. house construction) groups income/expense entries so they
--   can be totalled apart, against an optional budget. The money still moves
--   through the normal accounts, so family balances stay correct.
--   Entries may also record a quantity and unit (5000 pcs bricks, 20 bags cement).
-- Same permissions as dues: members read and add; the author or an admin edits/deletes.
-- =====================================================================

create table public.projects (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 100),
  budget      numeric(18, 2) check (budget is null or budget >= 0),
  note        text check (note is null or char_length(note) <= 500),
  is_done     boolean not null default false,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create function public.prepare_project() returns trigger
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

create trigger projects_prepare
  before insert or update on public.projects
  for each row execute function public.prepare_project();

alter table public.projects enable row level security;

create policy projects_read on public.projects
  for select to authenticated using (public.is_member());
create policy projects_insert on public.projects
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_member() and (public.is_admin() or created_by = auth.uid()))
  with check (public.is_member() and (public.is_admin() or created_by = auth.uid()));
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.is_member() and (public.is_admin() or created_by = auth.uid()));

revoke all on public.projects from anon;

-- ---------------------------------------------------------------------
-- Entries: optional project, quantity and unit. Transfers never belong to a project.
-- ---------------------------------------------------------------------
alter table public.transactions
  add column project_id bigint references public.projects (id) on delete restrict,
  add column quantity   numeric(18, 3) check (quantity is null or quantity > 0),
  add column unit       text check (unit is null or char_length(unit) <= 20),
  add constraint transactions_project_shape check (type <> 'Transfer' or project_id is null);

create index transactions_project_idx on public.transactions (project_id);

-- Same columns as before, with the new ones appended (required by "create or replace view").
create or replace view public.transaction_details with (security_invoker = true) as
select
  t.id, t.type, t.amount, t.date,
  t.account_id, a.name as account_name,
  t.to_account_id, ta.name as to_account_name,
  t.category_id, c.name_en as category_name_en, c.name_bn as category_name_bn,
  c.icon as category_icon, c.color as category_color,
  t.member_id, m.name as member_name,
  t.note,
  t.created_by, cb.name as created_by_name,
  t.created_at,
  t.project_id, p.name as project_name,
  t.quantity, t.unit
from public.transactions t
join public.accounts a on a.id = t.account_id
left join public.accounts ta on ta.id = t.to_account_id
left join public.categories c on c.id = t.category_id
left join public.profiles m on m.id = t.member_id
left join public.profiles cb on cb.id = t.created_by
left join public.projects p on p.id = t.project_id;

-- One row per project with its totals.
create view public.project_totals with (security_invoker = true) as
select
  p.id, p.name, p.budget, p.note, p.is_done, p.created_by, p.created_at,
  coalesce(sum(t.amount) filter (where t.type = 'Expense'), 0) as expense,
  coalesce(sum(t.amount) filter (where t.type = 'Income'), 0) as income,
  count(t.id) as entries,
  min(t.date) as first_date,
  max(t.date) as last_date
from public.projects p
left join public.transactions t on t.project_id = p.id
group by p.id;

revoke all on public.project_totals from anon;

-- ---------------------------------------------------------------------
-- List/summary functions gain a project filter. The old versions are dropped
-- first: an overload with one more defaulted argument would make calls ambiguous.
-- ---------------------------------------------------------------------
drop function public.list_transactions(date, date, text, bigint, uuid, text, int, int);
drop function public.transaction_summary(date, date, text, bigint, uuid, text);
drop function public.filtered_transactions(date, date, text, bigint, uuid, text);

create function public.filtered_transactions(
  p_from date, p_to date,
  p_type text default null, p_account bigint default null,
  p_member uuid default null, p_search text default null,
  p_project bigint default null)
returns setof public.transaction_details
language sql stable set search_path = public as $$
  select * from public.transaction_details d
  where d.date between p_from and p_to
    and (p_type is null or d.type = p_type)
    and (p_account is null or d.account_id = p_account or d.to_account_id = p_account)
    and (p_member is null or d.member_id = p_member)
    and (p_project is null or d.project_id = p_project)
    and (p_search is null or p_search = ''
         or d.note ilike '%' || p_search || '%'
         or d.category_name_en ilike '%' || p_search || '%'
         or d.category_name_bn ilike '%' || p_search || '%'
         or d.project_name ilike '%' || p_search || '%');
$$;

create function public.list_transactions(
  p_from date, p_to date,
  p_type text default null, p_account bigint default null,
  p_member uuid default null, p_search text default null,
  p_limit int default 50, p_offset int default 0,
  p_project bigint default null)
returns setof public.transaction_details
language sql stable set search_path = public as $$
  select * from public.filtered_transactions(p_from, p_to, p_type, p_account, p_member, p_search, p_project)
  order by date desc, id desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

create function public.transaction_summary(
  p_from date, p_to date,
  p_type text default null, p_account bigint default null,
  p_member uuid default null, p_search text default null,
  p_project bigint default null)
returns table (total bigint, income numeric, expense numeric)
language sql stable set search_path = public as $$
  select count(*),
         coalesce(sum(amount) filter (where type = 'Income'), 0),
         coalesce(sum(amount) filter (where type = 'Expense'), 0)
  from public.filtered_transactions(p_from, p_to, p_type, p_account, p_member, p_search, p_project);
$$;

revoke execute on function public.filtered_transactions, public.list_transactions,
  public.transaction_summary from anon;

-- ---------------------------------------------------------------------
-- Construction categories (skipped if one with the same English name exists).
-- Admins can rename or deactivate them in Categories.
-- ---------------------------------------------------------------------
insert into public.categories (type, name_en, name_bn, icon, color, sort_order)
select v.type, v.name_en, v.name_bn, v.icon, v.color, v.sort_order
from (values
  ('Expense', 'Bricks',             'ইট',            '🧱', '#b45309', 50),
  ('Expense', 'Sand',               'বালি',           '🏜️', '#ca8a04', 51),
  ('Expense', 'Cement',             'সিমেন্ট',         '🪣', '#64748b', 52),
  ('Expense', 'Rod / Steel',        'রড',             '🔩', '#475569', 53),
  ('Expense', 'Labour',             'মিস্ত্রি / মজুরি',  '👷', '#ea580c', 54),
  ('Expense', 'Other Construction', 'অন্যান্য নির্মাণ',  '🏗️', '#78716c', 55)
) as v(type, name_en, name_bn, icon, color, sort_order)
where not exists (select 1 from public.categories c where lower(c.name_en) = lower(v.name_en));
