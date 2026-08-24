create table if not exists public.message_edit_history (
  id          uuid        primary key default gen_random_uuid(),
  message_id  uuid        not null references public.messages(id) on delete cascade,
  edited_by   uuid        not null references auth.users(id) on delete cascade,
  previous_content text   not null,
  edited_at   timestamptz not null default now()
);

create index if not exists message_edit_history_message_id_idx
  on public.message_edit_history(message_id, edited_at desc);

alter table public.message_edit_history enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'message_edit_history'
      and policyname = 'participants can read edit history'
  ) then
    create policy "participants can read edit history"
      on public.message_edit_history for select
      using (
        exists (
          select 1
          from public.messages m
          join public.chat_members cm on cm.chat_id = m.chat_id
          where m.id = message_edit_history.message_id
            and cm.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'message_edit_history'
      and policyname = 'editor can insert own history'
  ) then
    create policy "editor can insert own history"
      on public.message_edit_history for insert
      with check (edited_by = auth.uid());
  end if;
end $$;
