
(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const grid = $("appsGrid"), count = $("appCount"), notice = $("notice");
  const IMAGE_BUCKET = "app-images";
  const APK_BUCKET = cfg.BUCKET || "apks";
  const APK_TYPE = "application/vnd.android.package-archive";

  $("year").textContent = new Date().getFullYear();

  if (!window.supabase || !cfg.SUPABASE_URL ||
      !cfg.SUPABASE_PUBLISHABLE_KEY ||
      cfg.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")) {
    showNotice("أكمل إعداد config.js بإضافة Publishable Key الخاص بمشروعك.");
    count.textContent = "بانتظار إعداد الاتصال";
    grid.innerHTML = "";
    return;
  }

  const client = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  const dialog = $("adminDialog");

  $("adminOpen").addEventListener("click", async () => {
    await refreshAdmin();
    dialog.showModal();
  });

  $("closeAdmin").onclick = () => dialog.close();

  dialog.addEventListener("click", e => {
    if (e.target === dialog) dialog.close();
  });

  $("loginBtn").onclick = login;

  $("logoutBtn").onclick = async () => {
    await client.auth.signOut();
    await refreshAdmin();
    message("تم تسجيل الخروج.");
  };

  $("appForm").addEventListener("submit", uploadApp);

  function showNotice(s) {
    notice.hidden = false;
    notice.textContent = s;
  }

  function clearNotice() {
    notice.hidden = true;
    notice.textContent = "";
  }

  function message(s, error = false) {
    $("modalMessage").textContent = s;
    $("modalMessage").style.color =
      error ? "#ffaaaa" : "#9ce6b0";
  }

  function publicImage(path) {
    if (!path) return "";
    return client.storage
      .from(IMAGE_BUCKET)
      .getPublicUrl(path).data.publicUrl;
  }

  async function loadApps() {
    clearNotice();

    const { data, error } = await client
      .from("apps")
      .select("id,name,description,version,storage_path,image_path,icon_path,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      grid.innerHTML = "";
      count.textContent = "تعذر تحميل التطبيقات";
      showNotice("تعذر تحميل التطبيقات: " + error.message);
      return;
    }

    count.textContent = `${data.length} تطبيق`;
    grid.innerHTML = "";

    if (!data.length) {
      grid.innerHTML =
        '<div class="notice">لا توجد تطبيقات منشورة حالياً. سجّل دخول الأدمن لإضافة أول تطبيق.</div>';
      return;
    }

    data.forEach(app => {
      const apkUrl = app.storage_path
        ? client.storage.from(APK_BUCKET)
            .getPublicUrl(app.storage_path).data.publicUrl
        : "";

      const card = document.createElement("article");
      card.className = "app-card";

      if (app.image_path) {
        const cover = document.createElement("img");
        cover.className = "app-cover";
        cover.src = publicImage(app.image_path);
        cover.alt = "صورة " + app.name;
        cover.loading = "lazy";
        card.append(cover);
      }

      const content = document.createElement("div");
      content.className = "app-content";

      let icon;

      if (app.icon_path) {
        icon = document.createElement("img");
        icon.className = "app-icon";
        icon.src = publicImage(app.icon_path);
        icon.alt = "أيقونة " + app.name;
        icon.loading = "lazy";
      } else {
        icon = document.createElement("div");
        icon.className = "app-icon";
        icon.textContent = (app.name || "ت").trim().slice(0, 1);
      }

      const info = document.createElement("div");
      info.className = "app-info";

      const title = document.createElement("h3");
      title.textContent = app.name;

      const desc = document.createElement("p");
      desc.textContent =
        app.description || "لا يوجد وصف لهذا التطبيق.";

      const meta = document.createElement("div");
      meta.className = "app-meta";
      meta.textContent =
        `الإصدار ${app.version || "1.0.0"} • ملف Android APK`;

      const link = document.createElement("a");
      link.className =
        "download-link" + (apkUrl ? "" : " disabled");
      link.textContent =
        apkUrl ? "تحميل التطبيق ↓" : "الملف غير مرفوع بعد";

      if (apkUrl) {
        link.href = apkUrl;
        link.target = "_blank";
        link.rel = "noopener";
      }

      info.append(title, desc, meta, link);
      content.append(icon, info);
      card.append(content);
      grid.append(card);
    });
  }

  async function refreshAdmin() {
    const { data: { session } } = await client.auth.getSession();

    $("loginPanel").hidden = !!session;
    $("adminPanel").hidden = !session;

    if (session) {
      $("adminIdentity").textContent =
        "مسجّل الدخول: " +
        (session.user.email || "حساب الأدمن");

      await loadAdminApps();
    }
  }

  async function login() {
    message("جارٍ تسجيل الدخول...");

    const { error } = await client.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value
    });

    if (error) {
      message(error.message, true);
      return;
    }

    message("تم تسجيل الدخول.");
    await refreshAdmin();
    await loadApps();
  }

  async function loadAdminApps() {
    const box = $("adminApps");
    box.textContent = "جارٍ التحميل...";

    const { data, error } = await client
      .from("apps")
      .select("id,name,storage_path,image_path,icon_path")
      .order("created_at", { ascending: false });

    if (error) {
      box.textContent = "تعذر تحميل القائمة: " + error.message;
      return;
    }

    box.innerHTML = "";

    data.forEach(app => {
      const row = document.createElement("div");
      row.className = "admin-app-row";

      const name = document.createElement("span");
      name.textContent = app.name;

      const del = document.createElement("button");
      del.className = "btn btn-ghost danger";
      del.textContent = "حذف";
      del.onclick = () => deleteApp(app);

      row.append(name, del);
      box.append(row);
    });

    if (!data.length) {
      box.textContent = "لا توجد تطبيقات بعد.";
    }
  }

  async function uploadImage(file, prefix) {
    if (!file) return null;

    if (!file.type.startsWith("image/")) {
      throw new Error("اختر ملف صورة صالحاً.");
    }

    const extension =
      (file.name.split(".").pop() || "jpg")
        .toLowerCase().replace(/[^a-z0-9]/g, "");

    const path =
      `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

    const { error } = await client.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (error) throw error;
    return path;
  }

  async function uploadApp(e) {
    e.preventDefault();

    const file = $("apkFile").files[0];
    const imageFile = $("appImage")?.files[0] || null;
    const iconFile = $("appIcon")?.files[0] || null;

    if (!file || !file.name.toLowerCase().endsWith(".apk")) {
      message("اختر ملف APK صالحاً.", true);
      return;
    }

    const name = $("appName").value.trim();
    const version = $("appVersion").value.trim();

    if (!name) {
      message("اكتب اسم التطبيق.", true);
      return;
    }

    const apkPath =
      `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const uploadedImages = [];
    let apkUploaded = false;

    $("uploadBtn").disabled = true;
    $("uploadBtn").textContent = "جارٍ الرفع...";

    try {
      const apkFile = new File([file], file.name, {
        type: APK_TYPE
      });

      const { error: apkError } = await client.storage
        .from(APK_BUCKET)
        .upload(apkPath, apkFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: APK_TYPE
        });

      if (apkError) throw apkError;
      apkUploaded = true;

      const imagePath = await uploadImage(imageFile, "cover");
      if (imagePath) uploadedImages.push(imagePath);

      const iconPath = await uploadImage(iconFile, "icon");
      if (iconPath) uploadedImages.push(iconPath);

      const { error: dbError } = await client
        .from("apps")
        .insert({
          name,
          description: $("appDescription").value.trim(),
          version,
          storage_path: apkPath,
          image_path: imagePath,
          icon_path: iconPath
        });

      if (dbError) throw dbError;

      $("appForm").reset();
      $("appVersion").value = "1.0.0";

      message("تم رفع التطبيق وصوره وإضافته بنجاح.");

      await loadApps();
      await loadAdminApps();

    } catch (err) {
      if (apkUploaded) {
        await client.storage.from(APK_BUCKET).remove([apkPath]);
      }

      if (uploadedImages.length) {
        await client.storage
          .from(IMAGE_BUCKET).remove(uploadedImages);
      }

      message("لم يكتمل الرفع: " + (err.message || err), true);

    } finally {
      $("uploadBtn").disabled = false;
      $("uploadBtn").textContent = "رفع التطبيق وإضافته";
    }
  }

  async function deleteApp(app) {
    if (!confirm(`هل تريد حذف ${app.name}؟`)) return;

    message("جارٍ الحذف...");

    const { error: dbError } = await client
      .from("apps")
      .delete()
      .eq("id", app.id);

    if (dbError) {
      message("تعذر حذف سجل التطبيق: " + dbError.message, true);
      return;
    }

    const apkFiles = app.storage_path
      ? [app.storage_path] : [];

    const imageFiles = [
      app.image_path,
      app.icon_path
    ].filter(Boolean);

    const results = await Promise.all([
      apkFiles.length
        ? client.storage.from(APK_BUCKET).remove(apkFiles)
        : Promise.resolve({ error: null }),
      imageFiles.length
        ? client.storage.from(IMAGE_BUCKET).remove(imageFiles)
        : Promise.resolve({ error: null })
    ]);

    const errors = results
      .filter(result => result.error)
      .map(result => result.error.message);

    if (errors.length) {
      message("حُذف سجل التطبيق، لكن تعذر حذف بعض الملفات: " + errors.join(" | "), true);
    } else {
      message("تم حذف التطبيق وملفاته وصوره.");
    }

    await loadApps();
    await loadAdminApps();
  }

  client.auth.onAuthStateChange(() => {
    refreshAdmin();
  });

  loadApps();
})();
