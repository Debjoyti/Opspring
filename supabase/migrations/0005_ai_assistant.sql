-- AI assistant: one persistent conversation per (user, org), real messages,
-- same RLS pattern as everything else (JWT org_roles claim, no app-code-only
-- filtering). org_id is denormalized onto ai_messages so its RLS policy
-- doesn't depend on a join into ai_conversations.

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ai_conversations_user_org_key on public.ai_conversations (user_id, org_id);

-- Message ids are AI SDK-generated (not UUIDs), so id is text.
create table public.ai_messages (
  id text primary key,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  parts jsonb not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_id_idx on public.ai_messages (conversation_id, created_at);
create index ai_conversations_org_id_idx on public.ai_conversations (org_id, updated_at desc);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy "members can manage their own conversation" on public.ai_conversations
for all to authenticated
using (org_id = any (private.jwt_org_ids()) and user_id = auth.uid())
with check (org_id = any (private.jwt_org_ids()) and user_id = auth.uid());

create policy "members can view messages in their org" on public.ai_messages
for select to authenticated
using (org_id = any (private.jwt_org_ids()));

create policy "members can insert messages into their own conversation" on public.ai_messages
for insert to authenticated
with check (
  org_id = any (private.jwt_org_ids())
  and exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
);

revoke all on public.ai_conversations from anon, authenticated;
revoke all on public.ai_messages from anon, authenticated;
grant select, insert, update on public.ai_conversations to authenticated;
grant select, insert on public.ai_messages to authenticated;
