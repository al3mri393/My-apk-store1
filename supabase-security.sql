-- اقرأ التعليمات قبل التنفيذ.
-- استبدل PUT_ADMIN_USER_UUID_HERE بمعرّف UID الحقيقي لحساب الأدمن من Authentication > Users.
-- هذه السياسات تستخدم UID ثابتاً، لذلك لا تعتمد على إخفاء عناصر الواجهة كوسيلة حماية.

-- تأكد أن الجدول موجود وأن حقوله مطابقة:
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  version text default '1.0.0',
  storage_path text,
  created_at timestamptz default now()
);

alter table public.apps alter column storage_path drop not null;
alter table public.apps enable row level security;

-- القراءة العامة للتطبيقات المنشورة
drop policy if exists "Public can view apps" on public.apps;
create policy "Public can view apps"
on public.apps for select to anon, authenticated
using (true);

-- كتابة الأدمن فقط
drop policy if exists "Admin can insert apps" on public.apps;
create policy "Admin can insert apps"
on public.apps for insert to authenticated
with check (auth.uid() = 'PUT_ADMIN_USER_UUID_HERE'::uuid);

drop policy if exists "Admin can update apps" on public.apps;
create policy "Admin can update apps"
on public.apps for update to authenticated
using (auth.uid() = 'PUT_ADMIN_USER_UUID_HERE'::uuid)
with check (auth.uid() = 'PUT_ADMIN_USER_UUID_HERE'::uuid);

drop policy if exists "Admin can delete apps" on public.apps;
create policy "Admin can delete apps"
on public.apps for delete to authenticated
using (auth.uid() = 'PUT_ADMIN_USER_UUID_HERE'::uuid);

-- سياسات ملفات APK في bucket اسمه apks
drop policy if exists "Admin upload APKs" on storage.objects;
create policy "Admin upload APKs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'apks'
  and auth.uid() = 'PUT_ADMIN_USER_UUID_HERE'::uuid
);

drop policy if exists "Admin delete APKs" on storage.objects;
create policy "Admin delete APKs"
on storage.objects for delete to authenticated
using (
  bucket_id = 'apks'
  and auth.uid() = 'PUT_ADMIN_USER_UUID_HERE'::uuid
);

drop policy if exists "Admin list APKs" on storage.objects;
create policy "Admin list APKs"
on storage.objects for select to authenticated
using (
  bucket_id = 'apks'
  and auth.uid() = 'PUT_ADMIN_USER_UUID_HERE'::uuid
);

-- لا نضيف سياسة SELECT عامة للـ storage.objects لأن روابط Public bucket
-- تسمح بالتنزيل العام عبر getPublicUrl دون كشف صلاحية سرد الملفات.
