-- 0003_sample_photos_open.sql（依頼11）：運営の見本写真を sample/ フォルダに置くための、一時的な入口
--   secret / service_role キーは使わない方針なので、見本を置く作業用の匿名ユーザー1人にだけ、
--   sample/ への「置く」を一時的に許す。置き終わったら 0004 で閉じる（with check (false)）。
--   作業用ユーザーは置き終わったら消す（auth.users から削除）。
create policy photos_sample_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'sample'
    and (select auth.uid()) = '7dddde99-2472-4ef9-a89d-facdac17bb3a'::uuid
  );
