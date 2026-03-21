-- Loads Requests Table
create table if not exists public.load_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  airline_code text not null,
  from_airport text not null,
  to_airport text not null,
  travel_date date not null,
  options jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

-- Loads Answers Table
create table if not exists public.load_answers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.load_requests(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  load_level text not null,
  notes text,
  as_of timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- User Credits Table
create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0,
  updated_at timestamptz not null default now()
);

-- Credits Ledger Table
create table if not exists public.credits_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount int not null,
  reason text,
  source text,
  created_at timestamptz not null default now()
);

-- RLS Policies
alter table public.load_requests enable row level security;
create policy "select_own_load_requests" on public.load_requests for select using (auth.uid() = user_id);
create policy "insert_own_load_requests" on public.load_requests for insert with check (auth.uid() = user_id);
create policy "update_own_load_requests" on public.load_requests for update using (auth.uid() = user_id);

alter table public.load_answers enable row level security;
create policy "select_own_load_answers" on public.load_answers for select using (auth.uid() = user_id);
create policy "insert_own_load_answers" on public.load_answers for insert with check (auth.uid() = user_id);

alter table public.user_credits enable row level security;
create policy "select_own_user_credits" on public.user_credits for select using (auth.uid() = user_id);

alter table public.credits_ledger enable row level security;
create policy "select_own_credits_ledger" on public.credits_ledger for select using (auth.uid() = user_id);

-- RPCs
create or replace function public.rpc_spend_credit(amount int, reason text, source text)
returns void as $$
begin
  update public.user_credits
  set balance = balance - amount, updated_at = now()
  where user_id = auth.uid() and balance >= amount;
  insert into public.credits_ledger (user_id, amount, reason, source) values (auth.uid(), -amount, reason, source);
end;
$$ language plpgsql security definer;

grant execute on function public.rpc_spend_credit to anon, authenticated;

create or replace function public.rpc_grant_credits(amount int, reason text, source text)
returns void as $$
begin
  insert into public.user_credits (user_id, balance, updated_at)
    values (auth.uid(), amount, now())
    on conflict (user_id) do update set balance = user_credits.balance + excluded.balance, updated_at = now();
  insert into public.credits_ledger (user_id, amount, reason, source) values (auth.uid(), amount, reason, source);
end;
$$ language plpgsql security definer;

grant execute on function public.rpc_grant_credits to anon, authenticated;
