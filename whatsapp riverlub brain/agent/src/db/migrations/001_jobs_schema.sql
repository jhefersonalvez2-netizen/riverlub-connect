create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  whatsapp_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  plate text unique,
  make text,
  model text,
  year integer,
  engine text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  conversation_contact_id text,
  type text,
  description text,
  status text not null default 'open',
  priority text not null default 'normal',
  created_by text not null default 'ai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  status text not null default 'draft',
  total_estimated numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id) on delete cascade,
  description text,
  quantity numeric not null default 1,
  unit_price numeric,
  total numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  amount numeric,
  status text not null default 'pending',
  due_date date,
  paid_at timestamptz,
  method text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  conversation_contact_id text,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60,
  ends_at timestamptz not null,
  service_type text,
  status text not null default 'pending_confirmation',
  confirmation_requested_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  reception_notified_at timestamptz,
  notes text,
  created_by text not null default 'ai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.return_reminders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  conversation_contact_id text,
  reminder_at timestamptz not null,
  reason text,
  status text not null default 'scheduled',
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  event_type text,
  entity_type text,
  entity_id uuid,
  conversation_contact_id text,
  payload jsonb,
  status text not null default 'pending',
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_contact_id text,
  action_type text,
  status text not null default 'pending',
  input jsonb,
  result jsonb,
  requires_confirmation boolean not null default false,
  confirmed_by_customer boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_customers_phone on public.customers(phone);
create index if not exists idx_customers_whatsapp_chat_id on public.customers(whatsapp_chat_id);
create index if not exists idx_vehicles_plate on public.vehicles(plate);
create index if not exists idx_appointments_scheduled_at on public.appointments(scheduled_at);
create index if not exists idx_appointments_status on public.appointments(status);
create index if not exists idx_service_requests_status on public.service_requests(status);
create index if not exists idx_job_events_status on public.job_events(status);

alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.service_requests enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.payments enable row level security;
alter table public.appointments enable row level security;
alter table public.return_reminders enable row level security;
alter table public.job_events enable row level security;
alter table public.ai_actions enable row level security;

revoke all on public.customers from anon, authenticated;
revoke all on public.vehicles from anon, authenticated;
revoke all on public.service_requests from anon, authenticated;
revoke all on public.quotes from anon, authenticated;
revoke all on public.quote_items from anon, authenticated;
revoke all on public.payments from anon, authenticated;
revoke all on public.appointments from anon, authenticated;
revoke all on public.return_reminders from anon, authenticated;
revoke all on public.job_events from anon, authenticated;
revoke all on public.ai_actions from anon, authenticated;

grant all on public.customers to service_role;
grant all on public.vehicles to service_role;
grant all on public.service_requests to service_role;
grant all on public.quotes to service_role;
grant all on public.quote_items to service_role;
grant all on public.payments to service_role;
grant all on public.appointments to service_role;
grant all on public.return_reminders to service_role;
grant all on public.job_events to service_role;
grant all on public.ai_actions to service_role;

insert into public.customers (name, phone, whatsapp_chat_id)
select 'Cliente Teste', '5587999999999', 'test@lid'
where not exists (
  select 1 from public.customers where whatsapp_chat_id = 'test@lid'
);

insert into public.vehicles (plate, make, model, year, engine, source)
values ('AAA1234', 'Toyota', 'Corolla', 2018, '2.0', 'seed')
on conflict (plate) do update set
  make = excluded.make,
  model = excluded.model,
  year = excluded.year,
  engine = excluded.engine,
  source = excluded.source,
  updated_at = now();
