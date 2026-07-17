create extension if not exists pgcrypto;

do $$
begin
  create type item_type as enum ('component', 'sub_assembly', 'finished_good');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type ledger_reason as enum ('received', 'consumed', 'adjusted', 'produced', 'shipped', 'returned', 'wasted');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type production_status as enum ('draft', 'in_progress', 'completed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type proposal_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'withdrawn');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type proposal_type as enum ('bom_change', 'item_change', 'process_change');
exception
  when duplicate_object then null;
end $$;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  plan text not null default 'starter',
  created_at timestamptz not null default now()
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  permissions jsonb not null default '{}'::jsonb,
  unique (name, tenant_id)
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  role_id uuid not null references roles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  type item_type not null,
  unit_of_measure text not null default 'each',
  reorder_point numeric,
  image_url text,
  is_archived boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sku, tenant_id)
);

create table if not exists bom_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  parent_item_id uuid not null references items(id) on delete cascade,
  child_item_id uuid not null references items(id),
  quantity numeric not null check (quantity > 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (parent_item_id, child_item_id)
);

create table if not exists stock_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  item_id uuid not null references items(id),
  quantity_delta numeric not null,
  reason ledger_reason not null,
  reference_type text,
  reference_id uuid,
  user_id uuid not null references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create or replace view current_stock as
  select item_id, tenant_id, sum(quantity_delta) as quantity
  from stock_ledger
  group by item_id, tenant_id;

create table if not exists production_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  item_id uuid not null references items(id),
  quantity numeric not null check (quantity > 0),
  status production_status not null default 'draft',
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type proposal_type not null,
  title text not null,
  description text,
  payload jsonb not null,
  status proposal_status not null default 'draft',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists proposal_reviews (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  reviewer_id uuid not null references profiles(id),
  action text not null check (action in ('approved', 'rejected', 'requested_changes')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists workflow_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  proposal_type proposal_type not null,
  step_order int not null,
  role_id uuid not null references roles(id),
  unique (tenant_id, proposal_type, step_order)
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);

create or replace function current_tenant_id()
returns uuid
language sql
stable
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
$$;

alter table tenants enable row level security;
alter table roles enable row level security;
alter table profiles enable row level security;
alter table items enable row level security;
alter table bom_lines enable row level security;
alter table stock_ledger enable row level security;
alter table production_orders enable row level security;
alter table proposals enable row level security;
alter table proposal_reviews enable row level security;
alter table workflow_steps enable row level security;
alter table audit_logs enable row level security;

create policy tenant_isolation_tenants on tenants
  using (id = current_tenant_id())
  with check (id = current_tenant_id());

create policy tenant_isolation_roles on roles
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy tenant_isolation_profiles on profiles
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy tenant_isolation_items on items
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy tenant_isolation_bom_lines on bom_lines
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy tenant_isolation_stock_ledger on stock_ledger
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy tenant_isolation_production_orders on production_orders
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy tenant_isolation_proposals on proposals
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy tenant_isolation_workflow_steps on workflow_steps
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy tenant_isolation_audit_logs on audit_logs
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
