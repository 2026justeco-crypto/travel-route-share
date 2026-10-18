-- 0007_delete_me.sql（依頼14）：利用規約への同意の印・「すべてのデータを消す」
--   依頼文では 0005_delete_me.sql だが、0005・0006 は使ったので、流した順の 0007 にした。
--
--   決まっていること（task14-kiyaku.md）
--   - 設定の「すべてのデータを消す」（2回押し）：旅行・投稿・写真・お気に入り・グループの参加・自宅を消し、匿名ユーザーからもログアウト
--   - 初めて全体に見せる保存のとき、1回だけ「投稿すると利用規約に同意したものとします」→ 出した（同意した）印を profiles_private に置く
--
--   消す仕組み：
--   - 写真（Storage）は SQL から消せない（storage.protect_delete が止める）ので、画面が先に Storage API で自分のフォルダを空にする。
--     この関数は、自分のフォルダに写真が残っていたら何も消さずにエラーを返す（利用者を消した後は誰も消せなくなるため）
--   - それ以外はこの関数が1回で消す。security definer だが、消すのは auth.uid() 本人の行だけ
--   - 自分が作ったグループ：ほかにメンバーがいれば、いちばん前から入っているメンバーに「作った人」を渡す（ほかの人のグループ・共有を消さない）。
--     ほかにメンバーがいなければグループごと消す
--   - 最後に auth.users の本人の行を消す（profiles は 0001 の trigger が消す）。端末のセッションは画面がログアウトして捨てる
--
--   ★この関数の DELETE は「本人が自分のデータを消す」機能そのもの。ほかの DROP / DELETE / TRUNCATE は書かない

-- ---------- 利用規約に同意した時刻（全体に見せる保存の前に1回だけ聞く） ----------
alter table public.profiles_private add column terms_agreed_at timestamptz;

-- ---------- すべてのデータを消す ----------
create function public.delete_my_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  g record;
  heir uuid;
  n_groups_deleted int := 0;
  n_groups_handed int := 0;
  n_members int;
  n_favorites int;
  n_trips int;
  n_posts int;
  n_home int;
  n_users int;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = me and p.is_sample) then
    raise exception 'sample user' using errcode = '42501';
  end if;
  -- 写真が残っていたら何も消さない（画面が Storage API で消してから呼ぶ）
  if exists (select 1 from storage.objects o where o.bucket_id = 'photos' and (storage.foldername(o.name))[1] = me::text) then
    raise exception 'photos remain' using errcode = 'P0001', hint = 'remove photos with the Storage API first';
  end if;

  -- 自分が作ったグループ：ほかのメンバーに渡す（いなければ消す）
  for g in select x.id from public.groups x where x.owner = me order by x.created_at for update loop
    select m.user_id into heir
      from public.group_members m
      where m.group_id = g.id and m.user_id <> me
      order by m.joined_at, m.user_id
      limit 1;
    if heir is null then
      delete from public.groups where id = g.id;  -- メンバー・招待・共有の行も消える（ほかに誰もいない）
      n_groups_deleted := n_groups_deleted + 1;
    else
      update public.groups set owner = heir where id = g.id;
      update public.group_members set role = 'owner' where group_id = g.id and user_id = heir;
      n_groups_handed := n_groups_handed + 1;
    end if;
  end loop;

  -- グループの参加（作った人を渡したグループの自分の行も、ここで消える）
  delete from public.group_members where user_id = me;
  get diagnostics n_members = row_count;
  delete from public.favorites where user_id = me;
  get diagnostics n_favorites = row_count;
  -- 旅行・投稿（正確な座標 *_exact・グループへの共有・ほかの人が付けたお気に入りも消える）
  delete from public.trips where owner = me;
  get diagnostics n_trips = row_count;
  delete from public.posts where owner = me;
  get diagnostics n_posts = row_count;
  -- 自宅・規約の同意
  delete from public.profiles_private where id = me;
  get diagnostics n_home = row_count;
  -- 利用者そのもの（profiles は on_auth_user_deleted の trigger が消す）
  delete from auth.users where id = me;
  get diagnostics n_users = row_count;
  delete from public.profiles where id = me and not is_sample;

  return jsonb_build_object(
    'trips', n_trips,
    'posts', n_posts,
    'favorites', n_favorites,
    'group_members', n_members,
    'groups_deleted', n_groups_deleted,
    'groups_handed_over', n_groups_handed,
    'home', n_home,
    'user', n_users
  );
end;
$$;

revoke execute on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;

notify pgrst, 'reload schema';
