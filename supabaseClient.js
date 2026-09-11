import { createClient } from "@supabase/supabase-js";

// Dipakai di sisi browser (aman dipakai di client karena pakai anon key + RLS)
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Dipakai HANYA di server (API routes) — punya akses penuh, jangan pernah dikirim ke browser
export function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/*
  SKEMA DATABASE (jalankan di Supabase SQL Editor):

  create table projects (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users not null,
    title text not null,
    source_type text not null check (source_type in ('upload', 'youtube_preview')),
    video_url text,
    status text not null default 'uploaded',
    transcript jsonb,
    created_at timestamptz default now()
  );

  create table clips (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references projects not null,
    start_ms integer not null,
    end_ms integer not null,
    clip_transcript text not null,
    hook_title text,
    viral_reason text,
    render_url text,
    render_status text default 'pending',
    render_error text,
    created_at timestamptz default now()
  );

  alter table projects enable row level security;
  alter table clips enable row level security;

  create policy "user melihat proyeknya sendiri" on projects
    for select using (auth.uid() = user_id);
  create policy "user kelola proyeknya sendiri" on projects
    for all using (auth.uid() = user_id);

  create policy "user melihat klip dari proyeknya sendiri" on clips
    for select using (
      exists (select 1 from projects where projects.id = clips.project_id and projects.user_id = auth.uid())
    );
*/
