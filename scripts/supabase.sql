-- جدول حفظ تقييمات اللقاء على Supabase (اختياري — يعمل الموقع بدونه)
create table if not exists public.evaluations (
  id uuid primary key,
  created_at timestamptz not null default now(),
  answers jsonb not null,
  notes text default '',
  duration_seconds int default 0
);

alter table public.evaluations enable row level security;

-- السيرفر يستخدم مفتاح service role (يتجاوز RLS).
-- إن أردت السماح بالإضافة من المتصفح مباشرة (anon key) أضف السياسات التالية:
-- create policy "anon can insert" on public.evaluations for insert to anon with check (true);
-- create policy "authenticated can read" on public.evaluations for select to authenticated using (true);

create index if not exists evaluations_created_at_idx on public.evaluations (created_at desc);
