-- 0002_photos.sql（依頼11）：写真をサーバー（Storage）に置く
--   バケット photos は非公開。表示は署名付きURL（有効期限つき）だけ。
--   パス：{持ち主の uid}/{ランダムな uuid}.jpg（運営の見本だけ sample/〜.jpg）
--   旅行のスポット spots[].photoId と posts.photo_path に、このパスを入れる。
--   ★見てよいかの判定は private.can_see(owner, visibility) に1つにまとめる（trips/posts/写真で同じ。依頼12でグループを足す）
--   ★DROP / DELETE / TRUNCATE は書かない（policy の差し替えは alter policy）

-- ---------- 見てよいか（trips/posts/写真の共通の判定） ----------
-- security definer：依頼12でグループの表を引くとき、その表の RLS と堂々めぐりにならないように
create function private.can_see(p_owner uuid, p_visibility text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_visibility = 'public'
      or (auth.uid() is not null and auth.uid() = p_owner)
$$;

-- 写真（パス）を見てよいか：その写真が付いている旅行・投稿のどれかを見てよいとき。
--   ★写真のフォルダが旅行・投稿の持ち主と同じときだけ数える（他人の写真のパスを自分の公開旅行に書いて覗く手を防ぐ）
--   運営の見本は sample/ フォルダ＋is_sample の旅行・投稿だけ
create function private.can_read_photo(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
           select 1 from public.posts p
           where p.photo_path = p_path
             and (split_part(p_path, '/', 1) = p.owner::text or (p.is_sample and split_part(p_path, '/', 1) = 'sample'))
             and private.can_see(p.owner, p.visibility)
         )
      or exists (
           select 1 from public.trips t
           where t.spots @> jsonb_build_array(jsonb_build_object('photoId', p_path))
             and (split_part(p_path, '/', 1) = t.owner::text or (t.is_sample and split_part(p_path, '/', 1) = 'sample'))
             and private.can_see(t.owner, t.visibility)
         )
$$;

-- policy から呼べるように（private は API には出ていない schema。呼べるのはこの2つだけ）
grant usage on schema private to anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.can_see(uuid, text) to anon, authenticated;
grant execute on function private.can_read_photo(text) to anon, authenticated;

-- trips/posts の「読む」を共通の判定に差し替える（中身は 0001 と同じ）
alter policy trips_read on public.trips using (private.can_see(owner, visibility));
alter policy posts_read on public.posts using (private.can_see(owner, visibility));

-- 写真のパスで探すための索引
create index trips_spots_gin on public.trips using gin (spots jsonb_path_ops);
create index posts_photo_path_idx on public.posts (photo_path) where photo_path is not null;

-- ---------- バケット（非公開・JPEG だけ・1枚 2MB まで。縮小後の目安は 300KB） ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg']);

-- ---------- storage.objects の RLS ----------
-- 読む（署名付きURLを作る・ダウンロード）：自分のフォルダ、または見てよい旅行・投稿に付いている写真
create policy photos_read on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.can_read_photo(name)
    )
  );
-- 置く：自分のフォルダにだけ（上書きの policy は作らない＝置き直しは新しいパスで）
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- 消す：本人だけ
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
