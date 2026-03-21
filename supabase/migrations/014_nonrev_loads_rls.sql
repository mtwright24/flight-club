-- RLS Policies for Non-Rev / Staff Loads tables

-- nonrev_searches: users can read/insert/update/delete only their own searches
alter table public.nonrev_searches enable row level security;
drop policy if exists "users_can_read_own_searches" on public.nonrev_searches;
drop policy if exists "users_can_create_searches" on public.nonrev_searches;
drop policy if exists "users_can_delete_own_searches" on public.nonrev_searches;

create policy "users_can_read_own_searches" on public.nonrev_searches for select using (auth.uid() = user_id);
create policy "users_can_create_searches" on public.nonrev_searches for insert with check (auth.uid() = user_id);
create policy "users_can_delete_own_searches" on public.nonrev_searches for delete using (auth.uid() = user_id);

-- nonrev_load_flights: anyone authenticated can read flights (public data)
alter table public.nonrev_load_flights enable row level security;
drop policy if exists "anyone_can_read_flights" on public.nonrev_load_flights;

create policy "anyone_can_read_flights" on public.nonrev_load_flights for select using (true);

-- nonrev_load_reports: anyone can read reports; authenticated users can insert own reports
alter table public.nonrev_load_reports enable row level security;
drop policy if exists "anyone_can_read_reports" on public.nonrev_load_reports;
drop policy if exists "users_can_create_reports" on public.nonrev_load_reports;
drop policy if exists "users_can_delete_own_reports" on public.nonrev_load_reports;

create policy "anyone_can_read_reports" on public.nonrev_load_reports for select using (true);
create policy "users_can_create_reports" on public.nonrev_load_reports for insert with check (auth.uid() = user_id);
create policy "users_can_delete_own_reports" on public.nonrev_load_reports for delete using (auth.uid() = user_id);

-- nonrev_alerts: users can read/insert/update/delete only their own alerts
alter table public.nonrev_alerts enable row level security;
drop policy if exists "users_can_read_own_alerts" on public.nonrev_alerts;
drop policy if exists "users_can_create_alerts" on public.nonrev_alerts;
drop policy if exists "users_can_update_own_alerts" on public.nonrev_alerts;
drop policy if exists "users_can_delete_own_alerts" on public.nonrev_alerts;

create policy "users_can_read_own_alerts" on public.nonrev_alerts for select using (auth.uid() = user_id);
create policy "users_can_create_alerts" on public.nonrev_alerts for insert with check (auth.uid() = user_id);
create policy "users_can_update_own_alerts" on public.nonrev_alerts for update using (auth.uid() = user_id);
create policy "users_can_delete_own_alerts" on public.nonrev_alerts for delete using (auth.uid() = user_id);

-- user_entitlements: users can read only their own; updates only via service role
alter table public.user_entitlements enable row level security;
drop policy if exists "users_can_read_own_entitlements" on public.user_entitlements;

create policy "users_can_read_own_entitlements" on public.user_entitlements for select using (auth.uid() = user_id);

-- loads_requests: users can read/insert/delete only their own requests
alter table public.loads_requests enable row level security;
drop policy if exists "users_can_read_own_requests" on public.loads_requests;
drop policy if exists "users_can_create_requests" on public.loads_requests;
drop policy if exists "users_can_delete_own_requests" on public.loads_requests;

create policy "users_can_read_own_requests" on public.loads_requests for select using (auth.uid() = user_id);
create policy "users_can_create_requests" on public.loads_requests for insert with check (auth.uid() = user_id);
create policy "users_can_delete_own_requests" on public.loads_requests for delete using (auth.uid() = user_id);

-- loads_answers: insertions only via service role (for future server-side logic)
alter table public.loads_answers enable row level security;
drop policy if exists "anyone_can_read_answers" on public.loads_answers;

create policy "anyone_can_read_answers" on public.loads_answers for select using (true);

-- credit_transactions: users can read only their own transactions; insertions only via service role
alter table public.credit_transactions enable row level security;
drop policy if exists "users_can_read_own_transactions" on public.credit_transactions;

create policy "users_can_read_own_transactions" on public.credit_transactions for select using (auth.uid() = user_id);

-- Update user_profiles RLS if not already set
alter table public.user_profiles enable row level security;
drop policy if exists "Public profiles are viewable by everyone" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;

create policy "Public profiles are viewable by everyone" on public.user_profiles for select using (true);
create policy "Users can update own profile" on public.user_profiles for update using (auth.uid() = id);
