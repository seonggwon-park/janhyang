create extension if not exists pgcrypto;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  album_name text,
  cover_image_url text,
  external_id text,
  external_source text,
  release_year integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists songs_external_source_id_unique
  on public.songs (external_source, external_id)
  where external_source is not null and external_id is not null;

create table if not exists public.music_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  emotions text[] not null,
  note text not null,
  listened_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.music_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  emotions text[] not null,
  title text,
  body text not null,
  listened_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.music_logs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

do $$
begin
  if exists (select 1 from public.music_logs where user_id is null) then
    raise notice 'music_logs has legacy rows without user_id. They remain inaccessible under RLS until manually assigned or removed.';
  else
    alter table public.music_logs alter column user_id set not null;
  end if;
end;
$$;

create index if not exists music_logs_created_at_idx
  on public.music_logs (created_at desc);

create index if not exists music_logs_song_id_idx
  on public.music_logs (song_id);

create index if not exists music_logs_user_created_at_idx
  on public.music_logs (user_id, created_at desc);

create index if not exists music_reflections_created_at_idx
  on public.music_reflections (created_at desc);

create index if not exists music_reflections_song_id_idx
  on public.music_reflections (song_id);

create index if not exists music_reflections_user_created_at_idx
  on public.music_reflections (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists songs_set_updated_at on public.songs;
create trigger songs_set_updated_at
before update on public.songs
for each row execute function public.set_updated_at();

drop trigger if exists music_logs_set_updated_at on public.music_logs;
create trigger music_logs_set_updated_at
before update on public.music_logs
for each row execute function public.set_updated_at();

drop trigger if exists music_reflections_set_updated_at on public.music_reflections;
create trigger music_reflections_set_updated_at
before update on public.music_reflections
for each row execute function public.set_updated_at();

alter table public.music_logs enable row level security;
alter table public.music_reflections enable row level security;

drop policy if exists music_logs_select_own on public.music_logs;
create policy music_logs_select_own
on public.music_logs
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists music_logs_insert_own on public.music_logs;
create policy music_logs_insert_own
on public.music_logs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists music_logs_update_own on public.music_logs;
create policy music_logs_update_own
on public.music_logs
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists music_logs_delete_own on public.music_logs;
create policy music_logs_delete_own
on public.music_logs
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists music_reflections_select_own on public.music_reflections;
create policy music_reflections_select_own
on public.music_reflections
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists music_reflections_insert_own on public.music_reflections;
create policy music_reflections_insert_own
on public.music_reflections
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists music_reflections_update_own on public.music_reflections;
create policy music_reflections_update_own
on public.music_reflections
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists music_reflections_delete_own on public.music_reflections;
create policy music_reflections_delete_own
on public.music_reflections
for delete
to authenticated
using (user_id = auth.uid());
