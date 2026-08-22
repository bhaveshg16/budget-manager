create table if not exists categories (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  type text not null check (type in ('expense','income')),
  is_default boolean not null default false,
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Migration for existing databases (run once in the Supabase SQL editor):
-- alter table categories add column if not exists deleted_at timestamptz;

create table if not exists recurring_rules (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id text not null references categories(id) on delete restrict,
  amount numeric not null,
  description text not null default '',
  type text not null check (type in ('expense','income')),
  frequency text not null check (frequency in ('weekly','monthly')),
  day_of_month int,
  day_of_week int,
  is_active boolean not null default true,
  start_date date not null,
  last_posted_date date,
  updated_at timestamptz not null default now()
);

create table if not exists transactions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('expense','income')),
  category_id text not null references categories(id) on delete restrict,
  amount numeric not null,
  description text not null default '',
  date date not null,
  time time not null,
  recurring_rule_id text references recurring_rules(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists budgets (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id text not null references categories(id) on delete restrict,
  month text not null,
  limit_amount numeric not null,
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);

alter table categories enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;
alter table recurring_rules enable row level security;

drop policy if exists "own rows only" on categories;
create policy "own rows only" on categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows only" on transactions;
create policy "own rows only" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows only" on budgets;
create policy "own rows only" on budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows only" on recurring_rules;
create policy "own rows only" on recurring_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Sync watermark must reflect true server-receipt order, not client clocks: an offline device's
-- edits carry a stale client-set updated_at, which could already be older than another device's
-- pull cursor by the time it finally pushes, silently hiding the edit from that device forever.
-- Stamping updated_at server-side on every write makes the pull watermark trustworthy regardless
-- of what the client sends.
--
-- syncAll() re-upserts every local row on every push (by design - no dirty-tracking), so most
-- pushed rows have nothing that actually changed. The WHEN-guard below leaves updated_at untouched
-- for no-op upserts, so an unmodified row doesn't re-enter the next pull's "changed since" window -
-- otherwise every push would bump every row's updated_at, and every following pull would silently
-- re-fetch the entire dataset instead of just the real deltas.
create or replace function set_updated_at() returns trigger as $$
begin
  if TG_OP = 'UPDATE' and (to_jsonb(OLD) - 'updated_at') = (to_jsonb(NEW) - 'updated_at') then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists categories_set_updated_at on categories;
create trigger categories_set_updated_at before insert or update on categories
  for each row execute function set_updated_at();
drop trigger if exists recurring_rules_set_updated_at on recurring_rules;
create trigger recurring_rules_set_updated_at before insert or update on recurring_rules
  for each row execute function set_updated_at();
drop trigger if exists transactions_set_updated_at on transactions;
create trigger transactions_set_updated_at before insert or update on transactions
  for each row execute function set_updated_at();
drop trigger if exists budgets_set_updated_at on budgets;
create trigger budgets_set_updated_at before insert or update on budgets
  for each row execute function set_updated_at();
