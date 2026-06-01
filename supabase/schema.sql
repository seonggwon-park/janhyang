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
  song_id uuid not null references public.songs(id) on delete cascade,
  emotions text[] not null,
  note text not null,
  listened_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists music_logs_created_at_idx
  on public.music_logs (created_at desc);

create index if not exists music_logs_song_id_idx
  on public.music_logs (song_id);

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
