-- 0006_bokashi.sql（依頼13）：位置のぼかし・自宅周りを隠す
--   依頼文では 0004_bokashi.sql だが、0004・0005 は使ったので、流した順の 0006 にした。
--
--   決まっていること（task13-bokashi.md）
--   - 持ち主には正確な位置、ほかの人にはぼかした位置。★ほかの人のブラウザに正確な座標が届かないこと
--   - ぼかし＝約300m のマス目の中心に丸める（同じ場所は毎回同じマス＝何度投稿しても平均で近づかない）。幅は private.blur_cell_m() の1か所
--   - 自宅（任意）から半径1km 以内の点は、ほかの人には位置そのものを出さない（lat/lng を null。名前・メモ・写真は出る）
--
--   作り方＝「表を分ける」：
--   - 正確な座標は trip_exact / post_exact（持ち主だけが読める）に置く
--   - trips.spots / posts.lat,lng には「ほかの人に見せる値」（ぼかした点・自宅の近くは null）だけを置く
--   - 書き込みは今までどおり trips / posts に正確な座標で書く。BEFORE trigger が正確な値を *_exact へ移し、
--     trips / posts の方をぼかした値に置き換える（＝画面のコードが何を送っても、ほかの人が読める列に正確な値は残らない）
--   - 自宅を登録・変更・消したら、その人の旅行・投稿のぼかしを作り直す（profiles_private の trigger）
--   view＋security definer 関数（列を隠す）の案は採らなかった：spots は1つの jsonb の中に座標が入っているので
--   列単位の権限では隠せず、持ち主も含めて全員が関数経由で読むことになり、PostgREST の絞り込み・埋め込みが使えなくなるため。
--
--   ★DROP / DELETE / TRUNCATE は書かない

-- ---------- 定数（ここだけで決める） ----------
-- ぼかしのマス目の幅（m）
create function private.blur_cell_m() returns double precision
language sql immutable set search_path = '' as $$ select 300::double precision $$;
-- 自宅のまわりで位置を出さない半径（m）
create function private.home_radius_m() returns double precision
language sql immutable set search_path = '' as $$ select 1000::double precision $$;

-- 2点の距離（m・球面近似）
create function private.dist_m(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision
language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(least(1, sqrt(
           power(sin(radians(b_lat - a_lat) / 2), 2)
         + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))
$$;

-- ---------- 自宅（本人だけ） ----------
create table public.profiles_private (
  id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  home_lat double precision check (home_lat between -90 and 90),
  home_lng double precision check (home_lng between -180 and 180),
  -- 「自宅を登録すると、近くの場所を自動で隠せます」を出したか（1回だけ）
  home_hint_done boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((home_lat is null) = (home_lng is null))
);
create trigger profiles_private_touch before update on public.profiles_private
  for each row execute function private.touch_updated_at();
alter table public.profiles_private enable row level security;

-- その人の自宅から半径の内側か（自宅が無ければ false）
create function private.is_near_home(p_owner uuid, p_lat double precision, p_lng double precision) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_lat is not null and p_lng is not null and exists (
    select 1 from public.profiles_private h
    where h.id = p_owner and h.home_lat is not null
      and private.dist_m(h.home_lat, h.home_lng, p_lat, p_lng) <= private.home_radius_m())
$$;

-- ほかの人に見せる1点：自宅の近く・座標なし・範囲外は null、それ以外はマス目の中心
--   緯度は 幅/111320 度ごと、経度はそのマスの中心の緯度で 幅/(111320·cos) 度ごと（どの位置でもほぼ 300m 四方）
create function private.blur_point(p_owner uuid, p_lat double precision, p_lng double precision) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when p_lat is null or p_lng is null or abs(p_lat) > 85 or abs(p_lng) > 180
      or private.is_near_home(p_owner, p_lat, p_lng)
      then jsonb_build_object('lat', null, 'lng', null)
    else (
      select jsonb_build_object(
               'lat', round(c.clat::numeric, 6),
               'lng', round(((floor(p_lng / (c.dlat / cos(radians(c.clat)))) + 0.5) * (c.dlat / cos(radians(c.clat))))::numeric, 6))
      from (select (floor(p_lat / g.dlat) + 0.5) * g.dlat as clat, g.dlat
            from (select private.blur_cell_m() / 111320.0 as dlat) g) c)
  end
$$;

-- 旅行のスポット（jsonb の配列）をまとめてぼかす。座標以外（名前・メモ・写真・移動手段）はそのまま
create function private.blur_spots(p_spots jsonb, p_owner uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
           case when jsonb_typeof(x.e) = 'object' then
             x.e || private.blur_point(
               p_owner,
               case when jsonb_typeof(x.e -> 'lat') = 'number' then (x.e ->> 'lat')::double precision end,
               case when jsonb_typeof(x.e -> 'lng') = 'number' then (x.e ->> 'lng')::double precision end)
           else x.e end
           order by x.i), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_spots, '[]'::jsonb)) with ordinality as x(e, i)
$$;

-- ---------- 正確な座標（持ち主だけ） ----------
-- trips / posts の BEFORE trigger から先に書くので、外部キーは「確定のときに確かめる」（deferrable）
create table public.trip_exact (
  trip_id uuid primary key references public.trips(id) on delete cascade deferrable initially deferred,
  owner uuid not null references public.profiles(id) on delete cascade,
  spots jsonb not null default '[]'::jsonb check (jsonb_typeof(spots) = 'array'),
  updated_at timestamptz not null default now()
);
create index trip_exact_owner_idx on public.trip_exact (owner);
alter table public.trip_exact enable row level security;

create table public.post_exact (
  post_id uuid primary key references public.posts(id) on delete cascade deferrable initially deferred,
  owner uuid not null references public.profiles(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  updated_at timestamptz not null default now()
);
create index post_exact_owner_idx on public.post_exact (owner);
alter table public.post_exact enable row level security;

-- 自宅の近くの投稿は lat/lng を null にするので、必須を外す（範囲の check はそのまま）
alter table public.posts alter column lat drop not null;
alter table public.posts alter column lng drop not null;

-- ---------- 書き込みのたびに「正確な値は *_exact へ・見せる列はぼかす」 ----------
--   UPDATE で座標が変わっていない（同じ値、またはぼかした値がそのまま返ってきた）ときは、*_exact から作り直す
--   （見せる先だけ変えた・自宅を変えた・upsert の衝突側、のどれでも正確な値がぼかした値で上書きされないように）
--   *_exact への書き込みは持ち主が同じ行だけ（他人の id で upsert して上書きする手を防ぐ）
create function private.trips_split_exact() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ex jsonb;
begin
  if tg_op = 'UPDATE' then
    select e.spots into ex from public.trip_exact e where e.trip_id = new.id and e.owner = new.owner;
    if ex is not null and (new.spots is not distinct from old.spots or new.spots = private.blur_spots(ex, new.owner)) then
      new.spots := private.blur_spots(ex, new.owner);
      return new;
    end if;
  end if;
  ex := coalesce(new.spots, '[]'::jsonb);
  insert into public.trip_exact as t (trip_id, owner, spots) values (new.id, new.owner, ex)
  on conflict (trip_id) do update set spots = excluded.spots, updated_at = now()
    where t.owner = excluded.owner;
  new.spots := private.blur_spots(ex, new.owner);
  return new;
end;
$$;

create function private.posts_split_exact() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  elat double precision;
  elng double precision;
  b jsonb;
begin
  if tg_op = 'UPDATE' then
    select e.lat, e.lng into elat, elng from public.post_exact e where e.post_id = new.id and e.owner = new.owner;
    if found then
      b := private.blur_point(new.owner, elat, elng);
      if (new.lat is not distinct from old.lat and new.lng is not distinct from old.lng)
         or (new.lat is not distinct from (b ->> 'lat')::double precision
             and new.lng is not distinct from (b ->> 'lng')::double precision) then
        new.lat := (b ->> 'lat')::double precision;
        new.lng := (b ->> 'lng')::double precision;
        return new;
      end if;
    end if;
  end if;
  if new.lat is null or new.lng is null then
    raise exception 'lat and lng are required' using errcode = '23502';
  end if;
  insert into public.post_exact as t (post_id, owner, lat, lng) values (new.id, new.owner, new.lat, new.lng)
  on conflict (post_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now()
    where t.owner = excluded.owner;
  b := private.blur_point(new.owner, new.lat, new.lng);
  new.lat := (b ->> 'lat')::double precision;
  new.lng := (b ->> 'lng')::double precision;
  return new;
end;
$$;

-- 自宅を登録・変更・消したら、その人の旅行・投稿のぼかしを作り直す（座標は変えない＝上の trigger が *_exact から作る）
create function private.profiles_private_reblur() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.home_lat is null then return null; end if;
  if tg_op = 'UPDATE' and new.home_lat is not distinct from old.home_lat and new.home_lng is not distinct from old.home_lng then
    return null;
  end if;
  update public.trips set spots = spots where owner = new.id;
  update public.posts set lat = lat, lng = lng where owner = new.id;
  return null;
end;
$$;

-- ---------- 画面から呼ぶ：保存の前に「自宅の近くか」を聞く（半径は SQL の1か所で決める） ----------
--   p_points：[{lat, lng}, …]。戻り：同じ順の true/false の配列（自宅が無ければ全部 false）
create function public.near_home(p_points jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
           private.is_near_home(
             auth.uid(),
             case when jsonb_typeof(x.e -> 'lat') = 'number' then (x.e ->> 'lat')::double precision end,
             case when jsonb_typeof(x.e -> 'lng') = 'number' then (x.e ->> 'lng')::double precision end)
           order by x.i), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_points) = 'array' then p_points else '[]'::jsonb end)
       with ordinality as x(e, i)
  where auth.uid() is not null
$$;

-- ---------- 権限 ----------
revoke execute on function private.blur_cell_m(), private.home_radius_m(),
  private.dist_m(double precision, double precision, double precision, double precision),
  private.is_near_home(uuid, double precision, double precision),
  private.blur_point(uuid, double precision, double precision), private.blur_spots(jsonb, uuid),
  private.trips_split_exact(), private.posts_split_exact(), private.profiles_private_reblur()
  from public, anon, authenticated;
revoke execute on function public.near_home(jsonb) from public, anon;
grant execute on function public.near_home(jsonb) to authenticated;

revoke all on public.trip_exact, public.post_exact, public.profiles_private from anon, authenticated;
-- 正確な座標：読むだけ（書くのは trigger だけ）。anon にも select を渡すのは、未ログインの一覧で埋め込み（trip_exact(spots)）が
-- 権限エラーにならないため。policy で本人の行しか返らない（未ログインは常に0件）
grant select on public.trip_exact, public.post_exact to anon, authenticated;
grant select, insert, update on public.profiles_private to authenticated;

-- ---------- RLS ----------
create policy trip_exact_read_own on public.trip_exact for select to anon, authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner);
create policy post_exact_read_own on public.post_exact for select to anon, authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner);

create policy profiles_private_read_own on public.profiles_private for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_private_insert_own on public.profiles_private for insert to authenticated
  with check ((select auth.uid()) = id);
create policy profiles_private_update_own on public.profiles_private for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ---------- 今あるデータ（見本・引っ越し分）を分ける ----------
insert into public.trip_exact (trip_id, owner, spots) select id, owner, spots from public.trips;
insert into public.post_exact (post_id, owner, lat, lng) select id, owner, lat, lng from public.posts;

create trigger trips_bokashi before insert or update on public.trips
  for each row execute function private.trips_split_exact();
create trigger posts_bokashi before insert or update on public.posts
  for each row execute function private.posts_split_exact();
create trigger profiles_private_reblur after insert or update on public.profiles_private
  for each row execute function private.profiles_private_reblur();

-- 見せる列をぼかした値に置き換える（座標は変えない＝trigger が *_exact から作る）
update public.trips set spots = spots;
update public.posts set lat = lat, lng = lng;

notify pgrst, 'reload schema';
