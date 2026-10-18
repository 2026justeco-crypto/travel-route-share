-- 0004_sample_photos_close.sql（依頼11）：見本写真の入口（0003）を閉じ、見本の投稿に写真を付ける
--   policy は消さずに「誰も通さない」にする（DROP を使わない方針）。不要になったら相談のうえ片付けてよい。
alter policy photos_sample_upload on storage.objects with check (false);

-- 運営の見本の投稿5件に、sample/ の写真（デモの見本画像と同じ絵柄・800x500 JPEG）を付ける。見本の旅行は元から写真なし
update public.posts set photo_path = v.path
from (values
  ('00000000-0000-4000-8000-000000000201'::uuid, 'sample/sapporo-tokeidai.jpg'),
  ('00000000-0000-4000-8000-000000000202'::uuid, 'sample/asakusa-kaminarimon.jpg'),
  ('00000000-0000-4000-8000-000000000203'::uuid, 'sample/osakajo-koen.jpg'),
  ('00000000-0000-4000-8000-000000000204'::uuid, 'sample/itsukushima-otorii.jpg'),
  ('00000000-0000-4000-8000-000000000205'::uuid, 'sample/hakata-ramen.jpg')
) as v(id, path)
where posts.id = v.id and posts.is_sample;
