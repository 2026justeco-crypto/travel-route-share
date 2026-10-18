-- 0001_init.sql（依頼10）：匿名ログイン＋旅行・投稿・お気に入り
--   守りは RLS だけ（公開キーはページに載る）。全テーブルで RLS を有効にする。
--   visibility：'public'＝全体／'groups'＝グループ（依頼12で読み取りを足す。今は本人だけ）／'private'＝自分だけ
--   ★DROP / DELETE / TRUNCATE は書かない（やり直しは新しい番号のファイルで）

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------- profiles ----------
-- id＝auth.users.id。運営の見本（is_sample）だけは auth.users に無い id を使うので、外部キーは張らず
-- auth.users を消したときは trigger で消す。
create table public.profiles (
  id uuid primary key,
  display_name text not null default '旅人' check (char_length(display_name) between 1 and 30),
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 匿名ログイン（や本登録）で auth.users に行ができたら、profiles に1行つくる
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.handle_deleted_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.profiles where id = old.id and not is_sample;
  return old;
end;
$$;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function private.handle_deleted_user();

-- updated_at を自動で更新
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- trips ----------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  start_date date,
  end_date date,
  status text not null default 'plan' check (status in ('plan', 'done')),
  spots jsonb not null default '[]'::jsonb check (jsonb_typeof(spots) = 'array'),
  visibility text not null default 'public' check (visibility in ('public', 'groups', 'private')),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trips_owner_idx on public.trips (owner);
create index trips_public_idx on public.trips (created_at desc) where visibility = 'public';
create trigger trips_touch before update on public.trips
  for each row execute function private.touch_updated_at();
alter table public.trips enable row level security;

-- ---------- posts ----------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  comment text not null default '',
  place text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  prefecture text not null default '',
  region text not null default '',
  date date,
  visibility text not null default 'public' check (visibility in ('public', 'groups', 'private')),
  photo_path text,            -- 依頼11で使う
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_owner_idx on public.posts (owner);
create index posts_public_idx on public.posts (created_at desc) where visibility = 'public';
create trigger posts_touch before update on public.posts
  for each row execute function private.touch_updated_at();
alter table public.posts enable row level security;

-- ---------- favorites ----------
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((trip_id is null) <> (post_id is null))
);
create unique index favorites_trip_uq on public.favorites (user_id, trip_id) where trip_id is not null;
create unique index favorites_post_uq on public.favorites (user_id, post_id) where post_id is not null;
alter table public.favorites enable row level security;

-- ---------- 権限（表の操作）：未ログイン(anon)は読むだけ。書くのはログイン済み(匿名ログイン含む)だけ ----------
revoke all on public.profiles, public.trips, public.posts, public.favorites from anon, authenticated;
grant select on public.profiles, public.trips, public.posts to anon;
grant select, update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.trips, public.posts to authenticated;
grant select, insert, delete on public.favorites to authenticated;

-- ---------- RLS ----------
-- profiles：表示名は誰でも読める（旅行の「作った人」に出すため）。変えられるのは自分の表示名だけ。作るのは trigger だけ
create policy profiles_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id and not is_sample);

-- trips：全体に見せたものは誰でも。それ以外（自分だけ・グループ）は本人だけ（グループは依頼12で足す）
create policy trips_read on public.trips for select to anon, authenticated
  using (visibility = 'public' or ((select auth.uid()) is not null and (select auth.uid()) = owner));
create policy trips_insert on public.trips for insert to authenticated
  with check ((select auth.uid()) = owner and not is_sample);
create policy trips_update on public.trips for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner and not is_sample);
create policy trips_delete on public.trips for delete to authenticated
  using ((select auth.uid()) = owner);

-- posts：trips と同じ
create policy posts_read on public.posts for select to anon, authenticated
  using (visibility = 'public' or ((select auth.uid()) is not null and (select auth.uid()) = owner));
create policy posts_insert on public.posts for insert to authenticated
  with check ((select auth.uid()) = owner and not is_sample);
create policy posts_update on public.posts for update to authenticated
  using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner and not is_sample);
create policy posts_delete on public.posts for delete to authenticated
  using ((select auth.uid()) = owner);

-- favorites：本人だけ。見られない旅行・投稿には付けられない（サブクエリにも trips/posts の RLS がかかる）
create policy favorites_read on public.favorites for select to authenticated
  using ((select auth.uid()) = user_id);
create policy favorites_insert on public.favorites for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      (trip_id is not null and exists (select 1 from public.trips t where t.id = trip_id))
      or (post_id is not null and exists (select 1 from public.posts p where p.id = post_id))
    )
  );
create policy favorites_delete on public.favorites for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------- 運営の見本（is_sample）。写真は依頼11まで無し ----------
insert into public.profiles (id, display_name, is_sample)
values ('00000000-0000-4000-8000-000000000001', '運営の見本', true);

insert into public.trips (id, owner, title, start_date, end_date, status, spots, visibility, is_sample, created_at)
values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  '東京から座間味まで 乗りもの全部のせ旅',
  '2026-09-20', '2026-09-24', 'done',
  '[
    {"id":"s1","name":"東京駅","memo":"新幹線で京都へ。","lat":35.6812,"lng":139.7671,"photoId":null,"moveTo":"train"},
    {"id":"s2","name":"京都駅","memo":"駅から歩いて東山へ。","lat":34.9858,"lng":135.7588,"photoId":null,"moveTo":"walk"},
    {"id":"s3","name":"清水寺","memo":"舞台からの眺めが最高。市バスで金閣寺へ。","lat":34.9949,"lng":135.785,"photoId":null,"moveTo":"bus"},
    {"id":"s4","name":"金閣寺","memo":"ここからレンタカーで空港へ。","lat":35.0394,"lng":135.7292,"photoId":null,"moveTo":"car"},
    {"id":"s5","name":"大阪国際空港（伊丹）","memo":"飛行機で那覇へ。","lat":34.7855,"lng":135.4382,"photoId":null,"moveTo":"plane"},
    {"id":"s6","name":"那覇空港","memo":"自転車を借りて港まで。","lat":26.2058,"lng":127.646,"photoId":null,"moveTo":"bike"},
    {"id":"s7","name":"泊港（とまりん）","memo":"フェリーで座間味島へ。","lat":26.2263,"lng":127.6806,"photoId":null,"moveTo":"ship"},
    {"id":"s8","name":"座間味港","memo":"海の青さにびっくり。","lat":26.229,"lng":127.303,"photoId":null}
  ]'::jsonb,
  'public', true, now() - interval '1 minute'
);

insert into public.posts (id, owner, title, comment, place, lat, lng, prefecture, region, date, visibility, is_sample, created_at)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001',
   '札幌時計台', '思ったより街中にあってびっくり。夜のライトアップがきれいでした。', '札幌市時計台',
   43.0626, 141.3536, '北海道', '北海道', '2026-06-14', 'public', true, now() - interval '5 days'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001',
   '浅草・雷門', '朝8時前なら人が少なくて写真が撮りやすい！仲見世で人形焼も。', '浅草 雷門',
   35.7112, 139.7965, '東京都', '関東', '2026-06-28', 'public', true, now() - interval '4 days'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001',
   '大阪城公園', '天守閣までの散歩が気持ちいい。梅林側から回るのがおすすめ。', '大阪城',
   34.6873, 135.5262, '大阪府', '関西', '2026-07-02', 'public', true, now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000001',
   '厳島神社の大鳥居', '干潮の時間を調べてから行くと鳥居まで歩けます。', '厳島神社',
   34.2959, 132.3197, '広島県', '中国', '2026-05-18', 'public', true, now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000001',
   '博多ラーメン', '替え玉2回。駅ナカでも十分おいしいお店が多い。', '博多駅周辺',
   33.5902, 130.4207, '福岡県', '九州・沖縄', '2026-07-06', 'public', true, now() - interval '1 day');
