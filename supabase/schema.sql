-- ===========================================================================
-- PayKal — schéma Supabase complet (Auth, PostgreSQL, Storage, Realtime)
-- ---------------------------------------------------------------------------
-- À exécuter UNE SEULE FOIS dans : Supabase > SQL Editor > New query > Run.
-- Le script est idempotent : vous pouvez le relancer sans risque.
--
-- Projet ciblé : https://sxtlttaswhodbtcjjdyn.supabase.co
--
-- Contenu :
--   1. Types énumérés (rôles, statuts, moyens de paiement)
--   2. Tables : profiles, transactions, messages
--   3. Index de performance
--   4. Trigger de création automatique de profil + garde-fou anti-escalade
--   5. Sécurité RLS (chaque client ne voit que ses données, l'admin voit tout)
--   6. Bucket Storage « receipts » + politiques pour les captures de reçus
--   7. Activation du Realtime (temps réel)
--   8. Passage d'un compte en administrateur
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. TYPES
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.user_role as enum ('client', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.tx_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_method as enum ('wave', 'orange_money', 'mtn_momo', 'moov_money', 'autre');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------------

-- 2.1 Profils (1 ligne par utilisateur auth.users)
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null default '',
  full_name   text not null default '',
  phone       text not null default '',
  role        public.user_role not null default 'client',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Profils PayKal : rôle « client » (parent/élève) ou « admin » (administration).';

-- 2.2 Transactions (demandes de rechargement)
create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  user_id          uuid not null references auth.users (id) on delete cascade,
  amount           numeric(14, 2) not null check (amount > 0),
  currency         text not null default 'XOF',
  method           public.payment_method not null default 'autre',
  sender_name      text,
  sender_phone     text,
  transfer_number  text not null default '074452674',
  proof_path       text,
  proof_url        text,
  client_note      text,
  status           public.tx_status not null default 'pending',
  admin_note       text,
  processed_by     uuid references auth.users (id) on delete set null,
  processed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.transactions is 'Demandes de rechargement : montant, capture du reçu, statut (pending/approved/rejected).';

-- 2.3 Messages (messagerie client ⇄ administration)
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  -- Propriétaire de la conversation = identifiant du client
  user_id          uuid not null references auth.users (id) on delete cascade,
  sender_id        uuid not null references auth.users (id) on delete cascade,
  sender_role      public.user_role not null,
  body             text not null check (length(btrim(body)) > 0),
  attachment_path  text,
  read_by_admin    boolean not null default false,
  read_by_client   boolean not null default false,
  created_at       timestamptz not null default now()
);

comment on table public.messages is 'Conversations : une ligne par message, groupées par user_id (le client).';

-- ---------------------------------------------------------------------------
-- 3. INDEX
-- ---------------------------------------------------------------------------

create index if not exists profiles_role_idx        on public.profiles (role);
create index if not exists transactions_user_idx    on public.transactions (user_id, created_at desc);
create index if not exists transactions_status_idx  on public.transactions (status, created_at desc);
create index if not exists transactions_ref_idx     on public.transactions (reference);
create index if not exists messages_user_idx        on public.messages (user_id, created_at);
create index if not exists messages_unread_idx      on public.messages (read_by_admin) where read_by_admin = false;

-- ---------------------------------------------------------------------------
-- 4. FONCTIONS ET TRIGGERS
-- ---------------------------------------------------------------------------

-- 4.1 L'utilisateur connecté est-il administrateur ?
--     SECURITY DEFINER : contourne la RLS pour éviter toute récursion.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- 4.2 Mise à jour automatique de updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists transactions_touch_updated_at on public.transactions;
create trigger transactions_touch_updated_at
  before update on public.transactions
  for each row execute function public.touch_updated_at();

-- 4.3 Création du profil à l'inscription (appelée par Supabase Auth)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    'client'
  )
  on conflict (id) do update
    set email     = excluded.email,
        full_name = case when excluded.full_name <> '' then excluded.full_name else public.profiles.full_name end,
        phone     = case when excluded.phone <> '' then excluded.phone else public.profiles.phone end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4.4 Anti-escalade de privilèges : un non-admin ne peut pas changer son rôle
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- 4.5 Horodatage automatique du traitement d'une transaction
create or replace function public.stamp_transaction_review()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status and new.status <> 'pending' then
    new.processed_at := coalesce(new.processed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_stamp_review on public.transactions;
create trigger transactions_stamp_review
  before update on public.transactions
  for each row execute function public.stamp_transaction_review();

-- ---------------------------------------------------------------------------
-- 5. SÉCURITÉ — ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.transactions enable row level security;
alter table public.messages     enable row level security;

-- 5.1 PROFILES --------------------------------------------------------------

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- 5.2 TRANSACTIONS ----------------------------------------------------------

drop policy if exists "transactions_select_own_or_admin" on public.transactions;
create policy "transactions_select_own_or_admin"
  on public.transactions for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "transactions_insert_own_pending" on public.transactions;
create policy "transactions_insert_own_pending"
  on public.transactions for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "transactions_update_admin" on public.transactions;
create policy "transactions_update_admin"
  on public.transactions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "transactions_delete_admin" on public.transactions;
create policy "transactions_delete_admin"
  on public.transactions for delete
  to authenticated
  using (public.is_admin());

-- 5.3 MESSAGES --------------------------------------------------------------

drop policy if exists "messages_select_own_or_admin" on public.messages;
create policy "messages_select_own_or_admin"
  on public.messages for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "messages_insert_participants" on public.messages;
create policy "messages_insert_participants"
  on public.messages for insert
  to authenticated
  with check (sender_id = auth.uid() and (user_id = auth.uid() or public.is_admin()));

drop policy if exists "messages_update_flags" on public.messages;
create policy "messages_update_flags"
  on public.messages for update
  to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "messages_delete_admin" on public.messages;
create policy "messages_delete_admin"
  on public.messages for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. STORAGE — captures d'écran des reçus (bucket « receipts »)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  8388608, -- 8 Mo
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = 8388608,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif'];

-- Convention de nommage utilisée par l'application : <user_id>/<horodatage>-<aleatoire>.<ext>
-- La première partie du chemin est donc TOUJOURS l'identifiant du client propriétaire.

drop policy if exists "receipts_insert_own_folder" on storage.objects;
create policy "receipts_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipts_select_own_or_admin" on storage.objects;
create policy "receipts_select_own_or_admin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "receipts_delete_admin" on storage.objects;
create policy "receipts_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'receipts' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. REALTIME — mises à jour en direct dans les deux interfaces
-- ---------------------------------------------------------------------------

alter table public.transactions replica identity full;
alter table public.messages     replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.transactions;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 8. PASSER UN COMPTE EN ADMINISTRATEUR
-- ---------------------------------------------------------------------------
-- 1) Créez d'abord le compte depuis l'application (écran « Créer un compte »).
-- 2) Remplacez l'adresse ci-dessous, décommentez les deux lignes, exécutez.
--
-- update public.profiles
--    set role = 'admin'
--  where email = 'admin@paykal.app';
--
-- Vérification :
-- select id, email, full_name, role from public.profiles order by created_at desc;

-- ---------------------------------------------------------------------------
-- 9. CONTRÔLE FINAL (doit retourner 3 lignes)
-- ---------------------------------------------------------------------------
select tablename, rowsecurity as rls_active
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'transactions', 'messages')
order by tablename;
