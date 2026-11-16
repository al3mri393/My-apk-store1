(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const grid = $("appsGrid"), count = $("appCount"), notice = $("notice");
  $("year").textContent = new Date().getFullYear();

  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY || cfg.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")) {
    showNotice("أكمل إعداد config.js بإضافة Publishable Key الخاص بمشروعك، ثم أعد تحميل الصفحة.");
    count.textContent = "بانتظار إعداد الاتصال";
    grid.innerHTML = "";
    return;
  }

  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const dialog = $("adminDialog");
  $("adminOpen").addEventListener("click", async () => { await refreshAdmin(); dialog.showModal(); });
  $("closeAdmin").onclick = () => dialog.close();
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  $("loginBtn").onclick = login;
  $("logoutBtn").onclick = async () => { await client.auth.signOut(); await refreshAdmin(); message("تم تسجيل الخروج."); };
  $("appForm").addEventListener("submit", uploadApp);

  function showNotice(s) { notice.hidden = false; notice.textContent = s; }
  function clearNotice() { notice.hidden = true; notice.textContent = ""; }
  function message(s, error=false) { $("modalMessage").textContent = s; $("modalMessage").style.color = error ? "#ffaaaa" : "#9ce6b0"; }

  async function loadApps() {
    clearNotice();
    const { data, error } = await client.from("apps").select("id,name,description,version,storage_path,created_at").order("created_at", { ascending: false });
    if (error) {
      grid.innerHTML = "";
      count.textContent = "تعذر تحميل التطبيقات";
      showNotice("تعذر الاتصال بجدول التطبيقات. تأكد من تنفيذ SQL وسياسة القراءة العامة في ملف README. التفاصيل: " + error.message);
      return;
    }
    count.textContent = `${data.length} تطبيق`;
    grid.innerHTML = "";
    if (!data.length) {
      grid.innerHTML = '<div class="notice">لا توجد تطبيقات منشورة حالياً. سجّل دخول الأدمن لإضافة أول تطبيق.</div>';
      return;
    }
    data.forEach(app => {
      const url = app.storage_path ? client.storage.from(cfg.BUCKET).getPublicUrl(app.storage_path).data.publicUrl : "";
      const card = document.createElement("article"); card.className = "app-card";
      const icon = document.createElement("div"); icon.className = "app-icon"; icon.textContent = (app.name || "ت").trim().slice(0,1);
      const info = document.createElement("div"); info.className = "app-info";
      const title = document.createElement("h3"); title.textContent = app.name;
      const desc = document.createElement("p"); desc.textContent = app.description || "لا يوجد وصف لهذا التطبيق.";
      const meta = document.createElement("div"); meta.className = "app-meta"; meta.textContent = `الإصدار ${app.version || "1.0.0"} • ملف Android APK`;
      const link = document.createElement("a"); link.className = "download-link" + (url ? "" : " disabled");
      link.textContent = url ? "تحميل التطبيق ↓" : "الملف غير مرفوع بعد";
      if (url) { link.href = url; link.target = "_blank"; link.rel = "noopener"; }
      info.append(title, desc, meta, link); card.append(icon, info); grid.append(card);
    });
  }

  async function refreshAdmin() {
    const { data: { session } } = await client.auth.getSession();
    $("loginPanel").hidden = !!session;
    $("adminPanel").hidden = !session;
    if (session) {
      $("adminIdentity").textContent = "مسجّل الدخول: " + (session.user.email || "حساب الأدمن");
      await loadAdminApps();
    }
  }
  async function login() {
    message("جارٍ تسجيل الدخول...");
    const { error } = await client.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
    if (error) { message(error.message, true); return; }
    message("تم تسجيل الدخول.");
    await refreshAdmin(); await loadApps();
  }
  async function loadAdminApps() {
    const box = $("adminApps"); box.textContent = "جارٍ التحميل...";
    const { data, error } = await client.from("apps").select("id,name,storage_path").order("created_at", { ascending: false });
    if (error) { box.textContent = "تعذر تحميل القائمة: " + error.message; return; }
    box.innerHTML = "";
    data.forEach(app => {
      const row = document.createElement("div"); row.className = "admin-app-row";
      const name = document.createElement("span"); name.textContent = app.name;
      const del = document.createElement("button"); del.className = "btn btn-ghost danger"; del.textContent = "حذف";
      del.onclick = () => deleteApp(app);
      row.append(name, del); box.append(row);
    });
    if (!data.length) box.textContent = "لا توجد تطبيقات بعد.";
  }
  async function uploadApp(e) {
    e.preventDefault();
    const file = $("apkFile").files[0];
    if (!file || !file.name.toLowerCase().endsWith(".apk")) { message("اختر ملف APK صالحاً.", true); return; }
    const name = $("appName").value.trim(), version = $("appVersion").value.trim();
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    $("uploadBtn").disabled = true; $("uploadBtn").textContent = "جارٍ الرفع...";
    try {
      const { error: upErr } = await client.storage.from(cfg.BUCKET).upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: "application/vnd.android.package-archive"
      });
      if (upErr) throw upErr;
      const { error: dbErr } = await client.from("apps").insert({
        name, description: $("appDescription").value.trim(), version, storage_path: path
      });
      if (dbErr) {
        await client.storage.from(cfg.BUCKET).remove([path]);
        throw dbErr;
      }
      $("appForm").reset(); $("appVersion").value = "1.0.0";
      message("تم رفع التطبيق وإضافته بنجاح.");
      await loadApps(); await loadAdminApps();
    } catch (err) { message("لم يكتمل الرفع: " + (err.message || err), true); }
    finally { $("uploadBtn").disabled = false; $("uploadBtn").textContent = "رفع التطبيق وإضافته"; }
  }
  async function deleteApp(app) {
    if (!confirm(`هل تريد حذف ${app.name}؟`)) return;
    message("جارٍ الحذف...");
    const { error: dbErr } = await client.from("apps").delete().eq("id", app.id);
    if (dbErr) { message("تعذر حذف سجل التطبيق: " + dbErr.message, true); return; }
    if (app.storage_path) {
      const { error: fileErr } = await client.storage.from(cfg.BUCKET).remove([app.storage_path]);
      if (fileErr) message("حُذف سجل التطبيق لكن تعذر حذف الملف: " + fileErr.message, true);
      else message("تم حذف التطبيق وملفه.");
    } else message("تم حذف التطبيق.");
    await loadApps(); await loadAdminApps();
  }
  client.auth.onAuthStateChange(() => { refreshAdmin(); });
  loadApps();
})();