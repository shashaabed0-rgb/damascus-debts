-- ============================================================================
-- كود Supabase SQL للتحديث v16 — تشغيله مرة واحدة فقط في SQL Editor
-- 1) ضمان وجود عمود login_password لإظهار ونسخ كلمة مرور المستخدم للمدير
-- 2) دالة حذف المستخدم ومسح جميع بياناته من السيرفر (workshop_members + auth.users)
-- 3) دالة حذف الورشة المعزولة بالكامل مع جميع مستخدميها من السيرفر
-- 4) دالة تحديث كلمة مرور المستخدم من قبل المدير وحفظها للعرض والنسخ
-- ============================================================================

ALTER TABLE public.workshop_members
  ADD COLUMN IF NOT EXISTS login_password text;

-- 1. مزامنة كلمة المرور عند تغييرها من قبل المستخدم نفسه
CREATE OR REPLACE FUNCTION public.sync_my_saved_password(new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  UPDATE public.workshop_members
     SET login_password = new_password
   WHERE user_id = auth.uid();
END;
$$;

-- 2. تعديل كلمة مرور موظف/مستخدم من قبل المدير (تُحدّث في auth.users وتُحفظ للعرض والنسخ)
CREATE OR REPLACE FUNCTION public.admin_update_member_password(
  target_user_id uuid,
  new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller public.workshop_members%ROWTYPE;
  v_target public.workshop_members%ROWTYPE;
BEGIN
  IF new_password IS NULL OR length(trim(new_password)) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل';
  END IF;

  SELECT * INTO v_caller FROM public.workshop_members WHERE user_id = auth.uid();
  IF NOT FOUND OR NOT v_caller.active OR v_caller.role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'غير مصرح لك بتعديل كلمات المرور';
  END IF;

  SELECT * INTO v_target FROM public.workshop_members WHERE user_id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم غير موجود';
  END IF;

  IF v_target.role = 'super_admin' THEN
    RAISE EXCEPTION 'لا يمكن تعديل حساب المدير العام من هنا';
  END IF;

  IF v_caller.role <> 'super_admin' AND v_target.workshop_id <> v_caller.workshop_id THEN
    RAISE EXCEPTION 'لا يمكنك تعديل مستخدم من ورشة أخرى';
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(trim(new_password), extensions.gen_salt('bf')),
         updated_at = now()
   WHERE id = target_user_id;

  UPDATE public.workshop_members
     SET login_password = trim(new_password)
   WHERE user_id = target_user_id;
END;
$$;

-- 3. حذف المستخدم ومسح بياناته نهائياً من السيرفر (workshop_members + auth.users)
CREATE OR REPLACE FUNCTION public.admin_delete_member_account(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller public.workshop_members%ROWTYPE;
  v_target public.workshop_members%ROWTYPE;
BEGIN
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'لا يمكنك حذف حسابك الشخصي';
  END IF;

  SELECT * INTO v_caller FROM public.workshop_members WHERE user_id = auth.uid();
  IF NOT FOUND OR NOT v_caller.active OR v_caller.role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'غير مصرح لك بحذف الحسابات';
  END IF;

  SELECT * INTO v_target FROM public.workshop_members WHERE user_id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الحساب غير موجود';
  END IF;

  IF v_target.role = 'super_admin' THEN
    RAISE EXCEPTION 'لا يمكن حذف المدير العام';
  END IF;

  IF v_caller.role <> 'super_admin' AND v_target.workshop_id <> v_caller.workshop_id THEN
    RAISE EXCEPTION 'لا يمكنك حذف حساب من ورشة أخرى';
  END IF;

  -- مسح العضوية من الورشة
  DELETE FROM public.workshop_members WHERE user_id = target_user_id;

  -- مسح حساب الدخول بالكامل من سيرفر المصادقة (auth.users) وما يرتبط به من جلسات وهويات
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- 4. حذف ورشة معزولة بالكامل مع جميع مستخدميها وديونها من السيرفر (للمدير العام فقط)
CREATE OR REPLACE FUNCTION public.super_admin_delete_workshop_completely(target_workshop_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller public.workshop_members%ROWTYPE;
  v_user_ids uuid[];
BEGIN
  SELECT * INTO v_caller FROM public.workshop_members WHERE user_id = auth.uid();
  IF NOT FOUND OR NOT v_caller.active OR v_caller.role <> 'super_admin' THEN
    RAISE EXCEPTION 'هذه العملية مخصصة للمدير العام فقط';
  END IF;

  IF target_workshop_id = v_caller.workshop_id THEN
    RAISE EXCEPTION 'لا يمكنك حذف ورشتك الأساسية';
  END IF;

  SELECT array_agg(user_id) INTO v_user_ids
    FROM public.workshop_members
   WHERE workshop_id = target_workshop_id
     AND role <> 'super_admin';

  DELETE FROM public.debt_records WHERE workshop_id = target_workshop_id;
  DELETE FROM public.workshop_members WHERE workshop_id = target_workshop_id;
  DELETE FROM public.workshops WHERE id = target_workshop_id;

  IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
    DELETE FROM auth.users WHERE id = ANY(v_user_ids);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_my_saved_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_member_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_member_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_delete_workshop_completely(uuid) TO authenticated;
