-- 0005_groups.sql（依頼12）：グループをサーバー版にする
--   依頼文では 0003_groups.sql だが、0003・0004 は依頼11（見本写真）で使ったので、流した順の 0005 にした。
--
--   決まっていること（task12-groups.md）
--   - 入り方：招待リンク（推測できない長さのコード）を開いて「参加する」を1回
--   - 招待リンクはメンバー全員が見られる。作り直すと古いリンクは使えない
--   - 作った人は抜けられない（消すことはできる）
--   - 抜けた人が見せていたものはグループに残す。抜けた人自身はもうグループの中を見られない
--   - グループを消すと、グループへの共有だけが消える（旅行・投稿そのものは消えない）
--   - 表示名：グループに参加・作成するとき1回だけ聞く（profiles.name_asked で覚える）
--
--   守りはすべて RLS と security definer 関数。メンバー判定は関数に任せる（policy 同士が互いの表を読むと無限再帰になるため）
--   ★DROP / DELETE / TRUNCATE は書かない

-- ---------- 表示名を聞いたか ----------
alter table public.profiles add column name_asked boolean not null default false;

-- ---------- 表 ----------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  owner uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index groups_owner_idx on public.groups (owner);
alter table public.groups enable row level security;

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);
alter table public.group_members enable row level security;

-- 招待コード（1グループ1つ。作り直すと上書き＝古いコードは使えない）
create table public.group_invites (
  group_id uuid primary key references public.groups(id) on delete cascade,
  code text not null unique check (char_length(code) >= 20),
  created_at timestamptz not null default now()
);
alter table public.group_invites enable row level security;

-- 見せる先（多対多）。グループを消すと行だけ消える（旅行・投稿は残る）
create table public.trip_groups (
  trip_id uuid not null references public.trips(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trip_id, group_id)
);
create index trip_groups_group_idx on public.trip_groups (group_id);
alter table public.trip_groups enable row level security;

create table public.post_groups (
  post_id uuid not null references public.posts(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, group_id)
);
create index post_groups_group_idx on public.post_groups (group_id);
alter table public.post_groups enable row level security;

-- ---------- 判定の関数（security definer：RLS の堂々めぐりを避ける） ----------
create function private.is_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = auth.uid())
$$;

create function private.owns_trip(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.trips t where t.id = p_trip and t.owner = auth.uid())
$$;

create function private.owns_post(p_post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.posts p where p.id = p_post and p.owner = auth.uid())
$$;

-- 旅行・投稿を見てよいか：今までの判定（全体・本人）＋「グループに見せたもので、読む人がその共有先グループのメンバー」
create function private.can_see_trip(p_id uuid, p_owner uuid, p_visibility text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_see(p_owner, p_visibility)
      or (p_visibility = 'groups' and auth.uid() is not null and exists (
            select 1 from public.trip_groups s
            join public.group_members m on m.group_id = s.group_id
            where s.trip_id = p_id and m.user_id = auth.uid()))
$$;

create function private.can_see_post(p_id uuid, p_owner uuid, p_visibility text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_see(p_owner, p_visibility)
      or (p_visibility = 'groups' and auth.uid() is not null and exists (
            select 1 from public.post_groups s
            join public.group_members m on m.group_id = s.group_id
            where s.post_id = p_id and m.user_id = auth.uid()))
$$;

-- 写真（パス）を見てよいか：0002 の判定を、グループを足した判定に差し替える（フォルダ＝持ち主の確認はそのまま）
create or replace function private.can_read_photo(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
           select 1 from public.posts p
           where p.photo_path = p_path
             and (split_part(p_path, '/', 1) = p.owner::text or (p.is_sample and split_part(p_path, '/', 1) = 'sample'))
             and private.can_see_post(p.id, p.owner, p.visibility)
         )
      or exists (
           select 1 from public.trips t
           where t.spots @> jsonb_build_array(jsonb_build_object('photoId', p_path))
             and (split_part(p_path, '/', 1) = t.owner::text or (t.is_sample and split_part(p_path, '/', 1) = 'sample'))
             and private.can_see_trip(t.id, t.owner, t.visibility)
         )
$$;

-- 招待コード：128ビット超の乱数（base64url 相当・24文字）
create function private.new_invite_code() returns text
language sql volatile security definer set search_path = '' as $$
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')
$$;

-- 表示名（1回だけ聞く）を入れる。空・長すぎは無視
create function private.apply_display_name(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v text := btrim(coalesce(p_name, ''));
begin
  if char_length(v) between 1 and 30 then
    update public.profiles set display_name = v, name_asked = true where id = auth.uid() and not is_sample;
  end if;
end;
$$;

-- ---------- 操作の関数（public に置く＝画面から rpc で呼ぶ。中で必ず auth.uid() を確かめる） ----------

-- つくる：グループ＋作った人のメンバー行＋招待コードを1度に作る。グループの id を返す
create function public.create_group(p_name text, p_color text, p_display_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  gid uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform private.apply_display_name(p_display_name);
  insert into public.groups (name, color, owner) values (btrim(p_name), lower(p_color), me) returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, me, 'owner');
  insert into public.group_invites (group_id, code) values (gid, private.new_invite_code());
  return gid;
end;
$$;

-- 招待コードからグループを引く（参加する前の確認画面用）。合わなければ0行（何も分からない）
--   コードは24文字の乱数なので総当たりは現実的でない。20文字未満は引かずに0行
create function public.peek_invite(p_code text)
returns table (group_id uuid, name text, color text, member_count int, owner_name text, already boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.color,
         (select count(*)::int from public.group_members m where m.group_id = g.id),
         (select p.display_name from public.profiles p where p.id = g.owner),
         private.is_member(g.id)
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  where auth.uid() is not null
    and char_length(coalesce(p_code, '')) >= 20
    and i.code = p_code
$$;

-- 参加する：コードが合えばメンバーにする。グループの id を返す（合わなければ null＝何も分からない）
create function public.join_group(p_code text, p_display_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  gid uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if char_length(coalesce(p_code, '')) < 20 then return null; end if;
  select i.group_id into gid from public.group_invites i where i.code = p_code;
  if gid is null then return null; end if;
  perform private.apply_display_name(p_display_name);
  insert into public.group_members (group_id, user_id, role) values (gid, me, 'member')
  on conflict (group_id, user_id) do nothing;
  return gid;
end;
$$;

-- 招待リンクを作り直す（作った人だけ）。新しいコードを返す
create function public.regenerate_invite(p_group uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v text;
begin
  if not exists (select 1 from public.groups g where g.id = p_group and g.owner = auth.uid()) then
    raise exception 'not the owner' using errcode = '42501';
  end if;
  v := private.new_invite_code();
  update public.group_invites set code = v, created_at = now() where group_id = p_group;
  return v;
end;
$$;

-- ---------- 権限（表の操作） ----------
revoke all on public.groups, public.group_members, public.group_invites, public.trip_groups, public.post_groups
  from anon, authenticated;
grant select, delete on public.groups to authenticated;            -- 作るのは create_group だけ
grant select, delete on public.group_members to authenticated;     -- 入るのは join_group だけ。delete＝抜ける
grant select on public.group_invites to authenticated;             -- 作り直しは regenerate_invite だけ
grant select, insert, delete on public.trip_groups, public.post_groups to authenticated;

revoke execute on function public.create_group(text, text, text), public.peek_invite(text),
  public.join_group(text, text), public.regenerate_invite(uuid) from public, anon;
grant execute on function public.create_group(text, text, text), public.peek_invite(text),
  public.join_group(text, text), public.regenerate_invite(uuid) to authenticated;

revoke execute on function private.is_member(uuid), private.owns_trip(uuid), private.owns_post(uuid),
  private.can_see_trip(uuid, uuid, text), private.can_see_post(uuid, uuid, text),
  private.new_invite_code(), private.apply_display_name(text) from public, anon, authenticated;
grant execute on function private.is_member(uuid), private.owns_trip(uuid), private.owns_post(uuid) to authenticated;
grant execute on function private.can_see_trip(uuid, uuid, text), private.can_see_post(uuid, uuid, text) to anon, authenticated;

-- ---------- RLS ----------
-- groups：メンバーだけ読める。消せるのは作った人だけ
create policy groups_read on public.groups for select to authenticated
  using (private.is_member(id));
create policy groups_delete on public.groups for delete to authenticated
  using ((select auth.uid()) = owner);

-- group_members：同じグループのメンバーだけ一覧を読める。自分の行だけ消せる（＝抜ける。作った人は不可）
create policy group_members_read on public.group_members for select to authenticated
  using (private.is_member(group_id));
create policy group_members_leave on public.group_members for delete to authenticated
  using ((select auth.uid()) = user_id and role <> 'owner');

-- group_invites：メンバーだけ読める（招待リンクはメンバー全員が見られる）
create policy group_invites_read on public.group_invites for select to authenticated
  using (private.is_member(group_id));

-- trip_groups / post_groups：
--   読む＝そのグループのメンバー、またはその旅行・投稿の持ち主（抜けたグループに見せたままのものを本人が知れるように）
--   付ける＝持ち主だけ、かつ自分が入っているグループにだけ
--   外す＝持ち主だけ（抜けた後でも外せる＝自分のものは自由にできる）
create policy trip_groups_read on public.trip_groups for select to authenticated
  using (private.is_member(group_id) or private.owns_trip(trip_id));
create policy trip_groups_insert on public.trip_groups for insert to authenticated
  with check (private.owns_trip(trip_id) and private.is_member(group_id));
create policy trip_groups_delete on public.trip_groups for delete to authenticated
  using (private.owns_trip(trip_id));

create policy post_groups_read on public.post_groups for select to authenticated
  using (private.is_member(group_id) or private.owns_post(post_id));
create policy post_groups_insert on public.post_groups for insert to authenticated
  with check (private.owns_post(post_id) and private.is_member(group_id));
create policy post_groups_delete on public.post_groups for delete to authenticated
  using (private.owns_post(post_id));

-- trips / posts の「読む」をグループ入りの判定に差し替える
alter policy trips_read on public.trips using (private.can_see_trip(id, owner, visibility));
alter policy posts_read on public.posts using (private.can_see_post(id, owner, visibility));
