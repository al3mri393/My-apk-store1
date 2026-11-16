
(() => {
  "use strict";

  const cfg = window.APP_CONFIG || {};
  const SUPABASE_URL = cfg.SUPABASE_URL;
  const SUPABASE_KEY = cfg.SUPABASE_PUBLISHABLE_KEY;
  const APK_BUCKET = cfg.BUCKET || "apks";
  const IMAGE_BUCKET = "app-images";

  if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Supabase configuration is missing.");
    return;
  }

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const $ = (id) => document.getElementById(id);

  const grid = $("appsGrid");
  const count = $("appCount");
  const notice = $("notice");

  let apps = [];
  let editingApp = null;
  let galleryToDelete = [];

  const ADMIN_EMAIL = "3191261d-a9be-4d52-8d27-9509ecb235b6";

  function message(text, error = false) {
    if (!notice) return;
    notice.textContent = text;
    notice.classList.toggle("error", error);
  }

  function modalMessage(text, error = false) {
    const el = $("modalMessage");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("error", error);
  }

  function safeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function publicUrl(bucket, path) {
    if (!path) return "";
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  function filePath(file) {
    const clean = file.name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]/g, "-");
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${clean}`;
  }

  function renderApps() {
    if (!grid) return;

    if (count) count.textContent = apps.length;

    if (!apps.length) {
      grid.innerHTML = '<p class="empty-state">لا توجد تطبيقات حالياً</p>';
      return;
    }

    grid.innerHTML = apps.map((app) => {
      const cover = publicUrl(IMAGE_BUCKET, app.image_path);
      const icon = publicUrl(IMAGE_BUCKET, app.icon_path);
      const apk = publicUrl(APK_BUCKET, app.storage_path);

      return `
        <article class="app-card">
          ${cover ? `<img class="app-cover" src="${cover}" alt="صورة ${safeText(app.name)}">` : ""}
          <div class="app-content">
            ${icon ? `<img class="app-icon" src="${icon}" alt="أيقونة التطبيق">` : ""}
            <div class="app-info">
              <h3>${safeText(app.name)}</h3>
              <p>${safeText(app.description)}</p>
              <small>الإصدار: ${safeText(app.version || "1.0")}</small>
            </div>
          </div>
          <a class="download-btn" href="${apk}" target="_blank" rel="noopener" download>
            تحميل التطبيق
          </a>
        </article>
      `;
    }).join("");
  }

  async function loadApps() {
    if (!grid) return;

    grid.innerHTML = '<p>جاري تحميل التطبيقات...</p>';

    const { data, error } = await client
      .from("apps")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      message("تعذر تحميل التطبيقات: " + error.message, true);
      grid.innerHTML = '<p>تعذر تحميل التطبيقات</p>';
      return;
    }

    apps = data || [];
    renderApps();
    renderAdminApps();
  }

  async function uploadImage(file) {
    if (!file) return null;

    if (!file.type.startsWith("image/")) {
      throw new Error("الملف المحدد ليس صورة.");
    }

    const path = filePath(file);
    const { error } = await client.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (error) throw error;
    return path;
  }

  async function uploadApk(file) {
    if (!file) return null;

    const apkFile = new File([file], file.name, {
      type: "application/vnd.android.package-archive"
    });

    const path = filePath(file);
    const { error } = await client.storage
      .from(APK_BUCKET)
      .upload(path, apkFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: "application/vnd.android.package-archive"
      });

    if (error) throw error;
    return path;
  }

  async function deleteStorageFile(bucket, path) {
    if (!path) return;

    const { error } = await client.storage
      .from(bucket)
      .remove([path]);

    if (error) throw error;
  }

  async function isAdmin() {
    const { data } = await client.auth.getSession();
    const user = data?.session?.user;

    return Boolean(user && user.id === ADMIN_EMAIL);
  }

  function renderAdminApps() {
    const area = $("adminApps");
    if (!area) return;

    area.innerHTML = apps.map((app) => `
      <div class="admin-app-row" data-id="${safeText(app.id)}">
        <div>
          <strong>${safeText(app.name)}</strong>
          <small>الإصدار ${safeText(app.version || "1.0")}</small>
        </div>
        <div class="admin-actions">
          <button type="button" data-edit="${safeText(app.id)}">تعديل</button>
          <button type="button" data-delete="${safeText(app.id)}">حذف</button>
        </div>
      </div>
    `).join("");

    area.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        const app = apps.find((item) => String(item.id) === button.dataset.edit);
        if (app) openEditor(app);
      });
    });

    area.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const app = apps.find((item) => String(item.id) === button.dataset.delete);
        if (app) deleteApp(app);
      });
    });
  }

  function openEditor(app) {
    editingApp = app;
    galleryToDelete = [];

    let dialog = $("appEditor");

    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "appEditor";
      dialog.innerHTML = `
        <form id="editForm">
          <h3>تعديل التطبيق</h3>

          <label>اسم التطبيق
            <input id="editName" required>
          </label>

          <label>الوصف
            <textarea id="editDescription"></textarea>
          </label>

          <label>الإصدار
            <input id="editVersion">
          </label>

          <label>استبدال ملف APK (اختياري)
            <input id="editApk" type="file" accept=".apk">
          </label>

          <label>تغيير صورة الغلاف
            <input id="editCover" type="file" accept="image/*">
          </label>

          <label>تغيير الأيقونة
            <input id="editIcon" type="file" accept="image/*">
          </label>

          <label>إضافة صور للمعرض
            <input id="editGallery" type="file" accept="image/*" multiple>
          </label>

          <div id="editGalleryPreview"></div>

          <p id="editMessage" role="status"></p>

          <button type="submit">حفظ التعديلات</button>
          <button type="button" id="closeEditor">إغلاق</button>
        </form>
      `;

      document.body.appendChild(dialog);

      $("closeEditor").addEventListener("click", () => dialog.close());

      $("editForm").addEventListener("submit", saveEdit);
    }

    $("editName").value = app.name || "";
    $("editDescription").value = app.description || "";
    $("editVersion").value = app.version || "1.0";

    $("editApk").value = "";
    $("editCover").value = "";
    $("editIcon").value = "";
    $("editGallery").value = "";

    renderGalleryEditor(app);

    if (!dialog.open) dialog.showModal();
  }

  function renderGalleryEditor(app) {
    const area = $("editGalleryPreview");
    if (!area) return;

    const paths = app.gallery_paths || [];

    area.innerHTML = `
      <h4>صور المعرض الحالية</h4>
      ${paths.map((path, index) => `
        <div class="gallery-edit-item">
          <img src="${publicUrl(IMAGE_BUCKET, path)}" alt="صورة المعرض">
          <button type="button" data-gallery-delete="${index}">حذف الصورة</button>
        </div>
      `).join("")}
    `;

    area.querySelectorAll("[data-gallery-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.galleryDelete);
        const path = paths[index];

        if (!path) return;

        galleryToDelete.push(path);
        app.gallery_paths = paths.filter((item) => item !== path);
        renderGalleryEditor(app);
      });
    });
  }

  async function saveEdit(event) {
    event.preventDefault();

    if (!editingApp) return;

    const submit = $("editForm").querySelector('[type="submit"]');
    const status = $("editMessage");

    try {
      submit.disabled = true;
      status.textContent = "جاري حفظ التعديلات...";

      const updates = {
        name: $("editName").value.trim(),
        description: $("editDescription").value.trim(),
        version: $("editVersion").value.trim() || "1.0",
        gallery_paths: (editingApp.gallery_paths || []).filter(
          (path) => !galleryToDelete.includes(path)
        )
      };

      const oldFiles = [];

      const apk = $("editApk").files[0];
      if (apk) {
        updates.storage_path = await uploadApk(apk);
        oldFiles.push([APK_BUCKET, editingApp.storage_path]);
      }

      const cover = $("editCover").files[0];
      if (cover) {
        updates.image_path = await uploadImage(cover);
        if (editingApp.image_path) {
          oldFiles.push([IMAGE_BUCKET, editingApp.image_path]);
        }
      }

      const icon = $("editIcon").files[0];
      if (icon) {
        updates.icon_path = await uploadImage(icon);
        if (editingApp.icon_path) {
          oldFiles.push([IMAGE_BUCKET, editingApp.icon_path]);
        }
      }

      const galleryFiles = Array.from($("editGallery").files);
      const newGallery = [];

      for (const file of galleryFiles) {
        newGallery.push(await uploadImage(file));
      }

      updates.gallery_paths = [
        ...updates.gallery_paths,
        ...newGallery
      ];

      const { error } = await client
        .from("apps")
        .update(updates)
        .eq("id", editingApp.id);

      if (error) throw error;

      for (const path of galleryToDelete) {
        await deleteStorageFile(IMAGE_BUCKET, path);
      }

      for (const [bucket, path] of oldFiles) {
        await deleteStorageFile(bucket, path);
      }

      status.textContent = "تم حفظ التعديلات بنجاح.";
      editingApp = null;
      galleryToDelete = [];

      $("appEditor").close();
      message("تم تحديث التطبيق بنجاح.");
      await loadApps();

    } catch (error) {
      status.textContent = "تعذر الحفظ: " + error.message;
      console.error(error);
    } finally {
      submit.disabled = false;
    }
  }

  async function deleteApp(app) {
    if (!confirm(`هل تريد حذف التطبيق "${app.name}"؟`)) return;

    try {
      message("جاري حذف التطبيق...");

      const { error } = await client
        .from("apps")
        .delete()
        .eq("id", app.id);

      if (error) throw error;

      const files = [
        [APK_BUCKET, app.storage_path],
        [IMAGE_BUCKET, app.image_path],
        [IMAGE_BUCKET, app.icon_path],
        ...(app.gallery_paths || []).map((path) => [IMAGE_BUCKET, path])
      ];

      for (const [bucket, path] of files) {
        if (path) {
          try {
            await deleteStorageFile(bucket, path);
          } catch (fileError) {
            console.error("تعذر حذف ملف:", path, fileError);
          }
        }
      }

      message("تم حذف التطبيق.");
      await loadApps();

    } catch (error) {
      message("تعذر حذف التطبيق: " + error.message, true);
    }
  }

  async function handleNewApp(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');

    try {
      submit.disabled = true;
      message("جاري رفع التطبيق...");

      const name = $("appName")?.value.trim();
      const description = $("appDescription")?.value.trim() || "";
      const version = $("appVersion")?.value.trim() || "1.0";
      const apkFile = $("apkFile")?.files[0];

      if (!name || !apkFile) {
        throw new Error("أدخل اسم التطبيق واختر ملف APK.");
      }

      const storage_path = await uploadApk(apkFile);

      let image_path = null;
      let icon_path = null;

      const coverFile = $("appImage")?.files[0];
      const iconFile = $("appIcon")?.files[0];

      if (coverFile) image_path = await uploadImage(coverFile);
      if (iconFile) icon_path = await uploadImage(iconFile);

      const { error } = await client.from("apps").insert({
        name,
        description,
        version,
        storage_path,
        image_path,
        icon_path,
        gallery_paths: []
      });

      if (error) throw error;

      form.reset();
      message("تم رفع التطبيق بنجاح.");
      await loadApps();

    } catch (error) {
      message("تعذر رفع التطبيق: " + error.message, true);
      console.error(error);
    } finally {
      submit.disabled = false;
    }
  }


    const adminPanel = $("adminPanel");
    const loginForm = $("loginForm");

    const allowed = await isAdmin();

    if (adminPanel) adminPanel.hidden = !allowed;
    if (loginForm) loginForm.hidden = allowed;

    renderAdminApps();
  }
async function updateAdminView() 

  async function login() {
const loginForm = $("loginForm");
const loginPanel = $("loginPanel");

if (loginPanel) loginPanel.hidden = allowed;
      modalMessage("أدخل البريد الإلكتروني وكلمة المرور.", true);
      return;
    }

    const button = $("loginBtn");
    if (button) button.disabled = true;

    const { error } = await client.auth.signInWithPassword({
      email,
      password
    });

    if (button) button.disabled = false;

    if (error) {
      modalMessage("تعذر تسجيل الدخول: " + error.message, true);
      return;
    }

    modalMessage("تم تسجيل الدخول بنجاح.");
    await updateAdminView();
  }

const adminOpen = $("adminOpen");
const adminDialog = $("adminDialog");
const closeAdmin = $("closeAdmin");

if (adminOpen && adminDialog) {
  adminOpen.onclick = () => {
    adminDialog.showModal();
  };
}

if (closeAdmin && adminDialog) {
  closeAdmin.onclick = () => {
    adminDialog.close();
  };
}
  const adminDialog = $("adminDialog");

  if (adminOpen && adminDialog) {
    adminOpen.addEventListener("click", () => {
      adminDialog.showModal();
    });
  }

  const closeAdmin = $("closeAdmin");
  if (closeAdmin && adminDialog) {
    closeAdmin.addEventListener("click", () => {
      adminDialog.close();
    });
  }
async function updateAdminView() {
  const adminPanel = $("adminPanel");
  const loginPanel = $("loginPanel");
  const allowed = await isAdmin();

  if (adminPanel) adminPanel.hidden = !allowed;
  if (loginPanel) loginPanel.hidden = allowed;

  const identity = $("adminIdentity");
  if (identity && allowed) {
    const { data } = await client.auth.getUser();
    identity.textContent = data.user?.email || "الأدمن";
  }

  renderAdminApps();
}
  const loginBtn = $("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", login);
  }

  const logoutBtn = $("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }

  const addForm = $("appForm");
  if (addForm) {
    addForm.addEventListener("submit", handleNewApp);
  }

  client.auth.onAuthStateChange(() => {
    updateAdminView();
  });

  loadApps();
  updateAdminView();

})();
