create table makers (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, city text not null, category text not null, created_at timestamptz default now());
create table products (id uuid primary key default gen_random_uuid(), maker_id uuid not null references makers(id) on delete cascade, name text not null, wholesale_price text, capacity text, created_at timestamptz default now());
create table leads (id uuid primary key default gen_random_uuid(), maker_id uuid not null references makers(id) on delete cascade, user_id uuid not null references auth.users(id), business_name text not null, score integer not null, rationale text not null, offer text, outreach_draft text, created_at timestamptz default now());
create table agent_runs (id uuid primary key default gen_random_uuid(), maker_id uuid not null references makers(id) on delete cascade, user_id uuid not null references auth.users(id), action text not null, input_summary text, output_summary text, created_at timestamptz default now());
alter table makers enable row level security; alter table products enable row level security; alter table leads enable row level security; alter table agent_runs enable row level security;
create policy "owner makers" on makers for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "owner products" on products for all using (maker_id in (select id from makers where user_id=auth.uid())) with check (maker_id in (select id from makers where user_id=auth.uid()));
create policy "owner leads" on leads for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "owner agent runs" on agent_runs for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
