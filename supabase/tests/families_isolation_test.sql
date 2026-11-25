-- =====================================================================
-- Family isolation test — run in Supabase → SQL Editor after 004_families.sql.
-- Safe on the real database: it ALWAYS ends with an error whose message is
-- the report, so Postgres rolls back everything it created (two test
-- families, three test logins). Read the report in the error message:
-- every line should start with PASS.
-- =====================================================================
do $$
declare
  a uuid := gen_random_uuid();   -- admin of test family A
  b uuid := gen_random_uuid();   -- admin of test family B
  c uuid := gen_random_uuid();   -- joins A with A's invite code (not approved yet)
  fa bigint;
  fb bigint;
  code_a text;
  acc_a bigint;
  acc_b bigint;
  n int;
  ok boolean;
  report text := '';
begin
  -- ---------- Set up (as the database owner) ----------
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (a, 'iso-test-a@example.invalid', 'authenticated', 'authenticated',
          jsonb_build_object('name', 'Test A', 'family_name', 'Test family A'));
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (b, 'iso-test-b@example.invalid', 'authenticated', 'authenticated',
          jsonb_build_object('name', 'Test B', 'family_name', 'Test family B'));

  select family_id into fa from public.profiles where id = a;
  select family_id into fb from public.profiles where id = b;
  select invite_code into code_a from public.families where id = fa;
  report := report || format(E'\n%s new families created for sign-ups (A=%s, B=%s)',
                             case when fa is not null and fb is not null and fa <> fb then 'PASS' else 'FAIL' end, fa, fb);

  select count(*) into n from public.profiles where id in (a, b) and role = 'Admin' and is_active;
  report := report || format(E'\n%s both founders are active admins', case when n = 2 then 'PASS' else 'FAIL' end);

  select count(*) into n from public.categories where family_id = fa;
  report := report || format(E'\n%s family A got default categories (%s)', case when n = 17 then 'PASS' else 'FAIL' end, n);

  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (c, 'iso-test-c@example.invalid', 'authenticated', 'authenticated',
          jsonb_build_object('name', 'Test C', 'invite_code', lower(code_a)));
  select count(*) into n from public.profiles where id = c and family_id = fa and not is_active and role = 'Member';
  report := report || format(E'\n%s invite code joins family A as an inactive member', case when n = 1 then 'PASS' else 'FAIL' end);

  begin
    insert into auth.users (id, email, aud, role, raw_user_meta_data)
    values (gen_random_uuid(), 'iso-test-d@example.invalid', 'authenticated', 'authenticated',
            jsonb_build_object('name', 'Test D', 'invite_code', 'NOPE-NOPE'));
    report := report || E'\nFAIL wrong invite code was accepted';
  exception when others then
    report := report || format(E'\n%s wrong invite code is refused', case when sqlerrm like '%INVALID_INVITE%' then 'PASS' else 'FAIL (' || sqlerrm || ')' end);
  end;

  -- ---------- As A: add an account ----------
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into public.accounts (name, type, opening_balance) values ('A cash', 'Cash', 1000) returning id into acc_a;
  select family_id into n from public.accounts where id = acc_a;
  report := report || format(E'\n%s new rows get the family automatically', case when n = fa then 'PASS' else 'FAIL' end);

  insert into public.transactions (type, amount, date, account_id, category_id)
  select 'Expense', 50, current_date, acc_a, id from public.categories where type = 'Expense' limit 1;
  select count(*) into n from public.profiles;
  report := report || format(E'\n%s A sees only own family members (%s: A and pending C)', case when n = 2 then 'PASS' else 'FAIL' end, n);

  -- ---------- As B: try to see or touch A's data ----------
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.accounts where family_id = fa;
  report := report || format(E'\n%s B cannot see A''s accounts', case when n = 0 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.account_balances where id = acc_a;
  report := report || format(E'\n%s B cannot see A''s balances', case when n = 0 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.transactions where family_id = fa;
  report := report || format(E'\n%s B cannot see A''s entries', case when n = 0 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.transaction_details;
  report := report || format(E'\n%s B''s entry list is empty', case when n = 0 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.categories;
  report := report || format(E'\n%s B sees only its own 17 categories (%s)', case when n = 17 then 'PASS' else 'FAIL' end, n);
  select count(*) into n from public.profiles;
  report := report || format(E'\n%s B sees only itself in members (%s)', case when n = 1 then 'PASS' else 'FAIL' end, n);
  select count(*) into n from public.families;
  report := report || format(E'\n%s B sees only its own family (%s)', case when n = 1 then 'PASS' else 'FAIL' end, n);
  select (public.dashboard(extract(year from current_date)::int, extract(month from current_date)::int) ->> 'expense')::numeric = 0 into ok;
  report := report || format(E'\n%s B''s dashboard does not count A''s spending', case when ok then 'PASS' else 'FAIL' end);

  update public.accounts set name = 'hacked' where id = acc_a;
  get diagnostics n = row_count;
  report := report || format(E'\n%s B cannot rename A''s account', case when n = 0 then 'PASS' else 'FAIL' end);
  delete from public.transactions where family_id = fa;
  get diagnostics n = row_count;
  report := report || format(E'\n%s B cannot delete A''s entries', case when n = 0 then 'PASS' else 'FAIL' end);

  insert into public.accounts (name, type) values ('B bank', 'Bank') returning id into acc_b;
  begin
    insert into public.transactions (type, amount, date, account_id, to_account_id)
    values ('Transfer', 10, current_date, acc_b, acc_a);
    report := report || E'\nFAIL B could transfer into A''s account';
  exception when others then
    report := report || format(E'\n%s B cannot point an entry at A''s account', case when sqlerrm like '%INVALID_REFERENCE%' then 'PASS' else 'FAIL (' || sqlerrm || ')' end);
  end;
  begin
    update public.accounts set family_id = fa where id = acc_b;
    select family_id into n from public.accounts where id = acc_b;
    report := report || format(E'\n%s B cannot move a row into family A', case when n = fb then 'PASS' else 'FAIL' end);
  exception when others then
    report := report || E'\nPASS B cannot move a row into family A';
  end;
  begin
    perform public.regenerate_invite_code();
    report := report || E'\nPASS admin B can renew its own invite code';
  exception when others then
    report := report || format(E'\nFAIL admin B could not renew its invite code (%s)', sqlerrm);
  end;
  select count(*) into n from public.families where id = fa and invite_code = code_a;
  -- (B cannot see family A at all, so this must be 0 even though A's code is unchanged.)
  report := report || format(E'\n%s B cannot read A''s invite code', case when n = 0 then 'PASS' else 'FAIL' end);

  -- ---------- As C (joined A, not approved): sees nothing but itself ----------
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.accounts;
  report := report || format(E'\n%s unapproved C sees no accounts', case when n = 0 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.profiles;
  report := report || format(E'\n%s unapproved C sees only its own profile', case when n = 1 then 'PASS' else 'FAIL' end);

  perform set_config('role', 'postgres', true);

  -- Always roll back: the report travels in the error message.
  raise exception 'FAMILY ISOLATION TEST (all test data rolled back):%', report;
end;
$$;
