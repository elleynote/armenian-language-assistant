-- Armenian language assistant: trusted knowledge, anonymous chat logs, retrieval, and rate limiting.
-- This migration is designed for a Supabase Postgres project.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create or replace function public.chatbot_normalize_text(input_text text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      lower(coalesce(input_text, '')),
      '[[:space:][:punct:]։՞՜՛]+',
      ' ',
      'g'
    )
  );
$$;

create table if not exists public.chatbot_knowledge (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  normalized_question text not null default '',
  answer text not null,
  category text,
  language text not null default 'Western Armenian',
  keywords text[] not null default '{}'::text[],
  source text,
  is_approved boolean not null default false,
  embedding extensions.vector(512),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chatbot_question_aliases (
  id uuid primary key default gen_random_uuid(),
  knowledge_id uuid not null references public.chatbot_knowledge(id) on delete cascade,
  alias text not null,
  normalized_alias text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chatbot_sessions (
  id uuid primary key default gen_random_uuid(),
  client_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.chatbot_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chatbot_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  source text not null check (source in ('user', 'database', 'ai_with_context', 'ai_fallback')),
  knowledge_id uuid references public.chatbot_knowledge(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.chatbot_ai_answers (
  id uuid primary key default gen_random_uuid(),
  normalized_question text not null default '',
  question text not null,
  answer text not null,
  context_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  times_asked integer not null default 1 check (times_asked > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_question)
);

create table if not exists public.chatbot_rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.chatbot_knowledge_normalize_trigger()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.normalized_question := public.chatbot_normalize_text(new.question);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists chatbot_knowledge_normalize_trigger on public.chatbot_knowledge;
create trigger chatbot_knowledge_normalize_trigger
before insert or update of question, answer, category, language, keywords, source, is_approved
on public.chatbot_knowledge
for each row execute function public.chatbot_knowledge_normalize_trigger();

create or replace function public.chatbot_alias_normalize_trigger()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.normalized_alias := public.chatbot_normalize_text(new.alias);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists chatbot_alias_normalize_trigger on public.chatbot_question_aliases;
create trigger chatbot_alias_normalize_trigger
before insert or update of alias
on public.chatbot_question_aliases
for each row execute function public.chatbot_alias_normalize_trigger();

create or replace function public.chatbot_ai_answer_normalize_trigger()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.normalized_question := public.chatbot_normalize_text(new.question);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists chatbot_ai_answer_normalize_trigger on public.chatbot_ai_answers;
create trigger chatbot_ai_answer_normalize_trigger
before insert or update of question, answer, status, times_asked
on public.chatbot_ai_answers
for each row execute function public.chatbot_ai_answer_normalize_trigger();

create index if not exists chatbot_knowledge_approved_normalized_idx
  on public.chatbot_knowledge (normalized_question)
  where is_approved = true;

create index if not exists chatbot_knowledge_question_trgm_idx
  on public.chatbot_knowledge using gin (normalized_question gin_trgm_ops)
  where is_approved = true;

create index if not exists chatbot_alias_normalized_idx
  on public.chatbot_question_aliases (normalized_alias);

create index if not exists chatbot_alias_trgm_idx
  on public.chatbot_question_aliases using gin (normalized_alias gin_trgm_ops);

create index if not exists chatbot_knowledge_keywords_idx
  on public.chatbot_knowledge using gin (keywords)
  where is_approved = true;

create index if not exists chatbot_knowledge_embedding_hnsw_idx
  on public.chatbot_knowledge using hnsw (embedding vector_cosine_ops)
  where is_approved = true and embedding is not null;

create index if not exists chatbot_messages_session_created_idx
  on public.chatbot_messages (session_id, created_at desc);

create index if not exists chatbot_sessions_client_hash_idx
  on public.chatbot_sessions (client_hash, last_seen_at desc);

create index if not exists chatbot_ai_answers_status_idx
  on public.chatbot_ai_answers (status, updated_at desc);

create or replace function public.search_chatbot_knowledge_lexical(
  p_query text,
  p_match_count integer default 5
)
returns table (
  id uuid,
  question text,
  answer text,
  category text,
  language text,
  source text,
  score double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with input as (
    select public.chatbot_normalize_text(p_query) as normalized
  ),
  alias_scores as (
    select
      a.knowledge_id,
      bool_or(a.normalized_alias = input.normalized) as exact_alias,
      max(similarity(a.normalized_alias, input.normalized))::double precision as alias_similarity
    from public.chatbot_question_aliases a
    cross join input
    where input.normalized <> ''
    group by a.knowledge_id
  ),
  scored as (
    select
      k.id,
      k.question,
      k.answer,
      k.category,
      k.language,
      k.source,
      case
        when k.normalized_question = input.normalized then 1.0
        when coalesce(a.exact_alias, false) then 0.99
        when greatest(
          similarity(k.normalized_question, input.normalized),
          coalesce(a.alias_similarity, 0)
        ) >= 0.82 then 0.93
        when greatest(
          similarity(k.normalized_question, input.normalized),
          coalesce(a.alias_similarity, 0)
        ) >= 0.65 then 0.78
        when to_tsvector(
          'simple',
          coalesce(k.question, '') || ' ' ||
          coalesce(k.answer, '') || ' ' ||
          coalesce(array_to_string(k.keywords, ' '), '')
        ) @@ plainto_tsquery('simple', input.normalized) then 0.72
        else greatest(
          similarity(k.normalized_question, input.normalized) * 0.70,
          coalesce(a.alias_similarity, 0) * 0.70
        )
      end::double precision as score
    from public.chatbot_knowledge k
    cross join input
    left join alias_scores a on a.knowledge_id = k.id
    where k.is_approved = true
      and input.normalized <> ''
  )
  select
    scored.id,
    scored.question,
    scored.answer,
    scored.category,
    scored.language,
    scored.source,
    scored.score
  from scored
  where scored.score >= 0.25
  order by scored.score desc, scored.question asc
  limit greatest(1, least(coalesce(p_match_count, 5), 10));
$$;

create or replace function public.match_chatbot_knowledge(
  p_query_embedding extensions.vector(512),
  p_match_threshold double precision default 0.68,
  p_match_count integer default 4
)
returns table (
  id uuid,
  question text,
  answer text,
  category text,
  language text,
  source text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    k.id,
    k.question,
    k.answer,
    k.category,
    k.language,
    k.source,
    (1 - (k.embedding <=> p_query_embedding))::double precision as similarity
  from public.chatbot_knowledge k
  where k.is_approved = true
    and k.embedding is not null
    and (1 - (k.embedding <=> p_query_embedding)) >= greatest(0.0, least(coalesce(p_match_threshold, 0.68), 1.0))
  order by k.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 4), 10));
$$;

create or replace function public.consume_chatbot_rate_limit(
  p_key text,
  p_max_requests integer default 20,
  p_window_seconds integer default 600
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_max_requests integer := greatest(coalesce(p_max_requests, 20), 1);
  v_window_seconds integer := greatest(coalesce(p_window_seconds, 600), 60);
begin
  if coalesce(length(trim(p_key)), 0) = 0 then
    raise exception 'rate limit key is required';
  end if;

  insert into public.chatbot_rate_limits as limits (
    key,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_key,
    now(),
    1,
    now()
  )
  on conflict (key) do update
  set
    window_started_at = case
      when limits.window_started_at <= now() - make_interval(secs => v_window_seconds)
        then now()
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at <= now() - make_interval(secs => v_window_seconds)
        then 1
      else limits.request_count + 1
    end,
    updated_at = now()
  returning
    limits.request_count <= v_max_requests,
    greatest(v_max_requests - limits.request_count, 0),
    limits.window_started_at + make_interval(secs => v_window_seconds)
  into allowed, remaining, reset_at;

  return next;
end;
$$;

alter table public.chatbot_knowledge enable row level security;
alter table public.chatbot_question_aliases enable row level security;
alter table public.chatbot_sessions enable row level security;
alter table public.chatbot_messages enable row level security;
alter table public.chatbot_ai_answers enable row level security;
alter table public.chatbot_rate_limits enable row level security;

revoke all on table public.chatbot_knowledge from anon, authenticated;
revoke all on table public.chatbot_question_aliases from anon, authenticated;
revoke all on table public.chatbot_sessions from anon, authenticated;
revoke all on table public.chatbot_messages from anon, authenticated;
revoke all on table public.chatbot_ai_answers from anon, authenticated;
revoke all on table public.chatbot_rate_limits from anon, authenticated;

grant select, insert, update, delete on table public.chatbot_knowledge to service_role;
grant select, insert, update, delete on table public.chatbot_question_aliases to service_role;
grant select, insert, update, delete on table public.chatbot_sessions to service_role;
grant select, insert, update, delete on table public.chatbot_messages to service_role;
grant select, insert, update, delete on table public.chatbot_ai_answers to service_role;
grant select, insert, update, delete on table public.chatbot_rate_limits to service_role;

revoke all on function public.search_chatbot_knowledge_lexical(text, integer) from public, anon, authenticated;
revoke all on function public.match_chatbot_knowledge(extensions.vector, double precision, integer) from public, anon, authenticated;
revoke all on function public.consume_chatbot_rate_limit(text, integer, integer) from public, anon, authenticated;

grant execute on function public.search_chatbot_knowledge_lexical(text, integer) to service_role;
grant execute on function public.match_chatbot_knowledge(extensions.vector, double precision, integer) to service_role;
grant execute on function public.consume_chatbot_rate_limit(text, integer, integer) to service_role;
