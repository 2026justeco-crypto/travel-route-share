-- 0008_seigen.sql（依頼16）：量・回数の上限と、利用者一覧の守り（公開前の仕上げ）
--
--   決まっていること（task16-seigen.md）
--   (1) 長さの上限（check 制約）。数字は private.lim() の1か所（画面は src/lib/limits.ts の1か所）
--   (2) 作るペースの上限（trigger）。1人あたり 旅行30件/日・投稿60件/日・グループ10個/日・写真200枚/日、どれも1分に10件まで。
--       合計の上限 旅行1000件・投稿3000件・写真3000枚。見本（is_sample）・既存の行の update は数えない
--   (4) profiles は anon / authenticated とも id と display_name だけ読める（列の権限）。自分の name_asked は public.my_profile() で読む
--
--   数え方（決めたこと）
--   - 「1分」「1日」は、作った記録（private.rate_events）を数える。行そのもの（created_at）は数えない：
--       created_at は画面から送れる値なので過去の日付にすれば数から外せる／消して作り直せば数が減る、の2つの抜け道があるため。
--     「1日」は直近24時間（暦日ではない）。記録は利用者を消すと一緒に消える（profiles への外部キー on delete cascade）
--   - 「合計」は今ある行（写真は storage.objects の自分のフォルダ）を数える（消せば減ってよい）
--   - 数えるのは AFTER INSERT の trigger：upsert が「既にある行の更新」になったときは AFTER INSERT が呼ばれないので、編集は数えない
--   - 同じ人が並列で作っても数え漏れないように、人×種類ごとに advisory lock（取引の終わりまで）で1本ずつにする
--   - auth.uid() が無い書き込み（SQL で入れる運営の見本・移行）と is_sample の行は数えない
--   - 写真は storage.objects の insert policy ではなく trigger：policy では記録を残せない（消して置き直すと数が戻る）うえ、
--     止めたときに「権限がない」と区別できる言葉を返せないため。trigger は Storage API の insert の中で動く（実測で確かめる）
--     → ★実測で止まらなかった（trigger の中では auth.uid() が空）。写真の数え方は 0009_photo_quota.sql で insert policy に差し替えた
--
--   超えたときのエラー：message が 'trs_rate_limit:{minute|day|total}:{trip|post|group|photo}'（画面が見分けて言葉にする）
--
--   ★DROP / DELETE / TRUNCATE は書かない（元の check 制約は消さずに、きつい方を足す）

-- ---------- 上限の数字（ここだけで決める） ----------
create function private.lim(p_key text) returns int
language sql immutable set search_path = '' as $$
  select case p_key
    -- 長さ（文字数。char_length＝コードポイント数）
    when 'trip_title' then 100
    when 'trip_spots' then 60          -- スポットの数
    when 'spot_name' then 100
    when 'spot_memo' then 1000
    when 'trip_spots_bytes' then 102400 -- trips.spots 全体（JSON の文字列にして UTF-8 のバイト数）＝100KB
    when 'post_title' then 100
    when 'post_comment' then 2000
    when 'post_place' then 200
    when 'display_name' then 30
    when 'group_name' then 30           -- 依頼文の目安は40字。0005 の check（30字）を消さない方針なので30字のまま
    -- 作るペース（1分・直近24時間・合計）
    when 'trip_minute' then 10
    when 'post_minute' then 10
    when 'group_minute' then 10
    when 'photo_minute' then 10
    when 'trip_day' then 30
    when 'post_day' then 60
    when 'group_day' then 10
    when 'photo_day' then 200
    when 'trip_total' then 1000
    when 'post_total' then 3000
    when 'photo_total' then 3000
  end
$$;

-- 旅行のスポット（jsonb の配列）が上限に収まっているか
create function private.spots_ok(p_spots jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_spots) = 'array'
     and jsonb_array_length(p_spots) <= private.lim('trip_spots')
     and octet_length(p_spots::text) <= private.lim('trip_spots_bytes')
     and not exists (
       select 1 from jsonb_array_elements(p_spots) as x(e)
       where char_length(coalesce(x.e ->> 'name', '')) > private.lim('spot_name')
          or char_length(coalesce(x.e ->> 'memo', '')) > private.lim('spot_memo'))
$$;

-- check 制約の中で呼ぶので、書く人（authenticated）が実行できる必要がある（中身は数字と判定だけ）
revoke execute on function private.lim(text), private.spots_ok(jsonb) from public;
grant execute on function private.lim(text), private.spots_ok(jsonb) to anon, authenticated;

-- ---------- (1) 長さの上限（今のデータが収まることは流す前に select で確かめた） ----------
alter table public.trips add constraint trips_title_max check (char_length(title) <= private.lim('trip_title'));
alter table public.trips add constraint trips_spots_max check (private.spots_ok(spots));
alter table public.posts add constraint posts_title_max check (char_length(title) <= private.lim('post_title'));
alter table public.posts add constraint posts_comment_max check (char_length(comment) <= private.lim('post_comment'));
alter table public.posts add constraint posts_place_max check (char_length(place) <= private.lim('post_place'));
alter table public.profiles add constraint profiles_display_name_max check (char_length(display_name) <= private.lim('display_name'));
alter table public.groups add constraint groups_name_max check (char_length(name) <= private.lim('group_name'));

-- ---------- (2) 作るペースの上限 ----------
create table private.rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('trip', 'post', 'group', 'photo')),
  at timestamptz not null default now()
);
create index rate_events_user_kind_at_idx on private.rate_events (user_id, kind, at);
alter table private.rate_events enable row level security;  -- policy なし＝API からは誰も読めない・書けない
revoke all on private.rate_events from public, anon, authenticated;

-- 1件作ってよいか確かめて、よければ記録する。p_total＝今の合計（作った行を含む）。null なら合計は見ない
create function private.take_rate(p_kind text, p_total bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  n int;
begin
  if me is null then return; end if;  -- SQL で入れる見本・移行は数えない
  -- 同じ人・同じ種類は1本ずつ（並列で作っても数え漏れない）
  perform pg_advisory_xact_lock(hashtextextended('trs_rate:' || me::text || ':' || p_kind, 0));
  if p_total is not null and private.lim(p_kind || '_total') is not null and p_total > private.lim(p_kind || '_total') then
    raise exception 'trs_rate_limit:total:%', p_kind using errcode = 'P0001';
  end if;
  select count(*) into n from private.rate_events e
    where e.user_id = me and e.kind = p_kind and e.at > now() - interval '24 hours';
  if n >= private.lim(p_kind || '_day') then
    raise exception 'trs_rate_limit:day:%', p_kind using errcode = 'P0001';
  end if;
  select count(*) into n from private.rate_events e
    where e.user_id = me and e.kind = p_kind and e.at > now() - interval '1 minute';
  if n >= private.lim(p_kind || '_minute') then
    raise exception 'trs_rate_limit:minute:%', p_kind using errcode = 'P0001';
  end if;
  insert into private.rate_events (user_id, kind) values (me, p_kind);
end;
$$;

create function private.rate_trips() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_sample or auth.uid() is null then return null; end if;
  perform private.take_rate('trip', (select count(*) from public.trips t where t.owner = new.owner));
  return null;
end;
$$;

create function private.rate_posts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_sample or auth.uid() is null then return null; end if;
  perform private.take_rate('post', (select count(*) from public.posts p where p.owner = new.owner));
  return null;
end;
$$;

create function private.rate_groups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return null; end if;
  perform private.take_rate('group', null);
  return null;
end;
$$;

-- 写真：自分のフォルダに置いた1枚ごと（見本の sample/ は数えない）
create function private.rate_photos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.bucket_id <> 'photos' or auth.uid() is null or (storage.foldername(new.name))[1] = 'sample' then
    return null;
  end if;
  perform private.take_rate('photo', (
    select count(*) from storage.objects o
    where o.bucket_id = 'photos' and (storage.foldername(o.name))[1] = auth.uid()::text));
  return null;
end;
$$;

revoke execute on function private.take_rate(text, bigint), private.rate_trips(), private.rate_posts(),
  private.rate_groups(), private.rate_photos() from public, anon, authenticated;

create trigger trips_rate after insert on public.trips
  for each row execute function private.rate_trips();
create trigger posts_rate after insert on public.posts
  for each row execute function private.rate_posts();
create trigger groups_rate after insert on public.groups
  for each row execute function private.rate_groups();
create trigger photos_rate after insert on storage.objects
  for each row when (new.bucket_id = 'photos') execute function private.rate_photos();

-- ---------- (4) 利用者一覧：読めるのは id と display_name だけ ----------
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name) on public.profiles to anon, authenticated;

-- 自分の行（表示名を聞いたか）だけを返す。グループをつくる・参加するときに画面が使う
create function public.my_profile()
returns table (id uuid, display_name text, name_asked boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.name_asked from public.profiles p where p.id = auth.uid()
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

notify pgrst, 'reload schema';
