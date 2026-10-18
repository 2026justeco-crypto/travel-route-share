-- 0009_photo_quota.sql（依頼16の続き）：写真の枚数の上限を storage.objects の insert policy で数える
--
--   0008 では storage.objects の AFTER INSERT trigger（private.rate_photos）で数えたが、実測で1分に12枚置けた（止まらなかった）。
--   private.rate_events に写真の記録が1件も残っていなかった＝trigger の中で auth.uid() が空だった（Storage API が最後の書き込みを
--   利用者の権限でなく自分の権限で行うため、と見ている。中を覗く確かめ方は止められたので★未確認）。
--   一方、insert policy（photos_insert）は利用者の権限で必ず通る（他人のフォルダに置けないことは依頼15で確かめ済み）。
--   そこで：
--   - 止めるのは insert policy：private.photo_limit_hit(auth.uid()) が null のときだけ置ける
--   - 数えるのは「今ある写真」（storage.objects の自分のフォルダ・created_at はサーバーが付ける）と
--     「置いた記録」（private.rate_events。trigger が動いた分だけ）の多い方。
--     trigger は利用者をフォルダ名（uuid）から決め、同じ写真は1回だけ記録する（ref＝パス）。動かない環境でも害はない
--   - policy で止まると Storage は「権限がない」とだけ返すので、画面は public.my_photo_limit() で理由を聞いて言葉にする
--   ★並列で一度にたくさん置くと、同時に数えた分だけ上限を少し超えうる（policy の中では1本ずつにできない）
--
--   ★DROP / DELETE / TRUNCATE は書かない

alter table private.rate_events add column ref text;
create unique index rate_events_kind_ref_uq on private.rate_events (kind, ref) where ref is not null;

-- 置いた記録（trigger。止めはしない）
create or replace function private.rate_photos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  folder text := (storage.foldername(new.name))[1];
begin
  if new.bucket_id <> 'photos' or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  if not exists (select 1 from public.profiles p where p.id = folder::uuid) then return null; end if;
  insert into private.rate_events (user_id, kind, ref) values (folder::uuid, 'photo', new.name)
  on conflict (kind, ref) where ref is not null do nothing;
  return null;
end;
$$;

-- いま1枚置くと上限を超えるか：'total' / 'day' / 'minute'、超えなければ null
create function private.photo_limit_hit(p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  n_total int;
  n_obj int;
  n_ev int;
begin
  if p_user is null then return null; end if;
  select count(*) into n_total from storage.objects o
    where o.bucket_id = 'photos' and (storage.foldername(o.name))[1] = p_user::text;
  if n_total >= private.lim('photo_total') then return 'total'; end if;

  select count(*) into n_obj from storage.objects o
    where o.bucket_id = 'photos' and (storage.foldername(o.name))[1] = p_user::text
      and o.created_at > now() - interval '24 hours';
  select count(*) into n_ev from private.rate_events e
    where e.user_id = p_user and e.kind = 'photo' and e.at > now() - interval '24 hours';
  if greatest(n_obj, n_ev) >= private.lim('photo_day') then return 'day'; end if;

  select count(*) into n_obj from storage.objects o
    where o.bucket_id = 'photos' and (storage.foldername(o.name))[1] = p_user::text
      and o.created_at > now() - interval '1 minute';
  select count(*) into n_ev from private.rate_events e
    where e.user_id = p_user and e.kind = 'photo' and e.at > now() - interval '1 minute';
  if greatest(n_obj, n_ev) >= private.lim('photo_minute') then return 'minute'; end if;
  return null;
end;
$$;
revoke execute on function private.photo_limit_hit(uuid) from public, anon, authenticated;
grant execute on function private.photo_limit_hit(uuid) to authenticated;

-- 置く：自分のフォルダにだけ、かつ枚数の上限の内側（0002 の条件に足す）
alter policy photos_insert on storage.objects
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.photo_limit_hit((select auth.uid())) is null
  );

-- 画面用：自分が今どの上限に当たっているか（置けなかったときの言葉を選ぶ）
create function public.my_photo_limit() returns text
language sql stable security definer set search_path = '' as $$
  select private.photo_limit_hit(auth.uid())
$$;
revoke execute on function public.my_photo_limit() from public, anon;
grant execute on function public.my_photo_limit() to authenticated;

notify pgrst, 'reload schema';
