(() => {
  "use strict";

  const config = window.TARANGAN_SUPABASE_CONFIG;
  const bucketName = config?.designAssetsBucket || "3d-designs";
  const maxImageSize = 10 * 1024 * 1024;
  const dashboard = document.querySelector("#dashboard-view");
  const panel = document.querySelector("#three-d-designs-panel");
  const form = document.querySelector("#three-d-design-form");
  const list = document.querySelector("#three-d-design-list");
  const notice = document.querySelector("#three-d-design-notice");
  const saveButton = document.querySelector("#three-d-design-save");
  const count = document.querySelector("#three-d-designs-count");
  const tabCount = document.querySelector("#three-d-designs-tab-count");
  const imageInput = document.querySelector("#three-d-image-file");
  const imageCurrent = document.querySelector("#three-d-image-current");
  const cancelButton = document.querySelector("#three-d-design-cancel");
  const designIdInput = document.querySelector("#three-d-design-id");
  const refreshButton = document.querySelector("#refresh-three-d-designs");
  const formTitle = document.querySelector("#three-d-design-form-title");
  const requiredImage = document.querySelector("[data-required-image]");
  let client;
  let designs = [];
  let busy = false;

  if (!dashboard || !panel || !form || !list || !notice || !saveButton
    || !count || !tabCount || !imageInput || !imageCurrent || !cancelButton
    || !designIdInput || !refreshButton || !formTitle || !requiredImage) {
    throw new Error("The 3D Designs admin controls could not be initialized.");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function setNotice(message, isError = false) {
    notice.textContent = message;
    notice.classList.toggle("is-error", isError);
    notice.classList.toggle("is-success", Boolean(message) && !isError);
  }

  function getClient() {
    if (client) return client;
    if (!config?.url || !config?.anonKey) {
      throw new Error("Supabase is not configured in supabase-config.js.");
    }
    if (!window.supabase?.createClient) {
      throw new Error("The Supabase client is not ready yet. Refresh the admin panel and try again.");
    }
    const adminApi = window.TARANGAN_LEAD_ADMIN_ACTIONS;
    if (typeof adminApi?.getSupabaseClient !== "function") {
      throw new Error("The authenticated admin client is unavailable. Refresh the admin panel and try again.");
    }
    client = adminApi.getSupabaseClient();
    return client;
  }

  async function requireAdmin() {
    const adminApi = window.TARANGAN_LEAD_ADMIN_ACTIONS;
    if (typeof adminApi?.requireAdmin !== "function") {
      throw new Error("Administrator authorization is unavailable. Refresh the admin panel and try again.");
    }
    const user = await adminApi.requireAdmin();
    getClient();
    return user;
  }

  async function createImageUrl(path) {
    if (!path) return "";
    const { data, error } = await getClient().storage
      .from(bucketName)
      .createSignedUrl(path, 3600);
    if (error) throw new Error(`Could not create a viewing link for a design image: ${error.message}`);
    return data.signedUrl;
  }

  function setBusy(value) {
    busy = value;
    saveButton.disabled = value;
    saveButton.textContent = value ? "Saving design…" : "Save design";
    refreshButton.disabled = value;
  }

  function updateImageLabel(design) {
    imageCurrent.textContent = design?.thumbnail_url
      ? `Current image: ${design.thumbnail_url}`
      : "No image uploaded yet.";
    requiredImage.hidden = Boolean(design?.thumbnail_url);
  }

  function resetForm() {
    form.reset();
    designIdInput.value = "";
    form.elements.display_order.value = "0";
    formTitle.textContent = "Add a design";
    cancelButton.hidden = true;
    imageInput.value = "";
    updateImageLabel(null);
  }

  function startEditing(id) {
    const design = designs.find(item => item.id === id);
    if (!design) {
      setNotice("That design is no longer in the list. Refresh and try again.", true);
      return;
    }
    designIdInput.value = design.id;
    form.elements.title.value = design.title || "";
    form.elements.category.value = design.category || "";
    form.elements.description.value = design.description || "";
    form.elements.status.value = design.status;
    form.elements.is_featured.checked = Boolean(design.is_featured);
    form.elements.display_order.value = String(design.display_order ?? 0);
    imageInput.value = "";
    updateImageLabel(design);
    formTitle.textContent = "Edit design";
    cancelButton.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    form.elements.title.focus({ preventScroll: true });
  }

  function renderDesigns() {
    count.textContent = String(designs.length);
    tabCount.textContent = String(designs.length);
    if (!designs.length) {
      list.innerHTML = '<div class="empty-state"><strong>No 3D designs yet</strong><span>Add an image-based design above to build your portfolio.</span></div>';
      return;
    }
    list.innerHTML = designs.map(design => {
      const image = design.signedImageUrl
        ? `<img src="${escapeHtml(design.signedImageUrl)}" alt="${escapeHtml(design.title)} design image" loading="lazy" decoding="async">`
        : "";
      const published = design.status === "published";
      return `<article class="three-d-design-card" data-design-card="${escapeHtml(design.id)}">
        <div class="three-d-design-card-preview">${image}</div>
        <div class="three-d-design-card-copy">
          <span class="three-d-design-status${published ? " is-published" : ""}">${published ? "Published" : "Draft"}${design.is_featured ? " · Featured" : ""}</span>
          <h4>${escapeHtml(design.title)}</h4>
          <p>${escapeHtml(design.category)} · Order ${escapeHtml(design.display_order)}</p>
          <p>${escapeHtml(design.description || "No description provided.")}</p>
          <div class="three-d-design-card-actions">
            <button class="button button-secondary" type="button" data-edit-design="${escapeHtml(design.id)}">Edit</button>
            <button class="button button-secondary" type="button" data-toggle-design="${escapeHtml(design.id)}">${published ? "Unpublish" : "Publish"}</button>
            <button class="button button-danger-quiet" type="button" data-delete-design="${escapeHtml(design.id)}">Delete</button>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  async function loadDesigns(force = false) {
    if (busy && !force) return false;
    list.innerHTML = '<p class="empty-state">Loading 3D designs…</p>';
    setNotice("");
    try {
      await requireAdmin();
      const { data, error } = await getClient()
        .from("three_d_designs")
        .select("id,title,category,description,thumbnail_url,status,is_featured,display_order,created_at")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Could not load 3D designs: ${error.message}`);
      designs = await Promise.all((data || []).map(async design => ({
        ...design,
        signedImageUrl: await createImageUrl(design.thumbnail_url)
      })));
      renderDesigns();
      setNotice(`Loaded ${designs.length} design(s).`);
      return true;
    } catch (error) {
      designs = [];
      count.textContent = "—";
      tabCount.textContent = "—";
      list.innerHTML = '<div class="empty-state"><strong>3D designs could not be loaded</strong><span>Check the database migration, storage setup, and administrator policies.</span></div>';
      setNotice(error.message, true);
      console.error("[3D designs] Load failed.", error);
      return false;
    }
  }

  function validateImage(file) {
    if (!file) return;
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    const expectedType = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
      : extension === ".png" ? "image/png"
        : extension === ".webp" ? "image/webp" : "";
    if (!expectedType) {
      throw new Error("Choose a JPG, JPEG, PNG, or WebP image.");
    }
    if (file.size > maxImageSize) {
      throw new Error("The design image must be 10 MB or smaller.");
    }
    if (file.type && file.type !== expectedType) {
      throw new Error("The design image file extension and image type do not match.");
    }
    return expectedType;
  }

  async function uploadImage(file, userId, designId) {
    const imageType = validateImage(file);
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    const objectPath = `designs/${userId}/${designId}/image-${crypto.randomUUID()}${extension}`;
    const { error } = await getClient().storage
      .from(bucketName)
      .upload(objectPath, file, { contentType: imageType, cacheControl: "3600", upsert: false });
    if (error) throw new Error(`Could not upload design image: ${error.message}`);
    return objectPath;
  }

  async function removeImages(paths) {
    const uniquePaths = [...new Set(paths.filter(Boolean))];
    if (!uniquePaths.length) return;
    const { error } = await getClient().storage.from(bucketName).remove(uniquePaths);
    if (error) throw new Error(`Could not remove design images: ${error.message}`);
  }

  async function saveDesign(event) {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const formData = new FormData(form);
    const editingId = String(formData.get("id") || "");
    const existing = designs.find(item => item.id === editingId);
    const imageFile = imageInput.files?.[0];
    try {
      validateImage(imageFile);
    } catch (error) {
      setNotice(error.message, true);
      return;
    }
    if (!existing && !imageFile) {
      setNotice("Choose a design image before saving a new entry.", true);
      imageInput.focus();
      return;
    }
    if (existing && !existing.thumbnail_url && !imageFile) {
      setNotice("Choose an image before saving this design.", true);
      imageInput.focus();
      return;
    }

    setBusy(true);
    setNotice("Verifying administrator access…");
    const uploadedPaths = [];
    let committed = false;
    try {
      const user = await requireAdmin();
      const id = editingId || crypto.randomUUID();
      const payload = {
        title: String(formData.get("title") || "").trim(),
        category: String(formData.get("category") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        status: String(formData.get("status") || "draft"),
        is_featured: formData.get("is_featured") === "on",
        display_order: Number(formData.get("display_order") || 0),
        thumbnail_url: existing?.thumbnail_url || null
      };
      if (!Number.isSafeInteger(payload.display_order)) {
        throw new Error("Display order must be a whole number.");
      }

      if (imageFile) {
        setNotice("Uploading design image…");
        payload.thumbnail_url = await uploadImage(imageFile, user.id, id);
        uploadedPaths.push(payload.thumbnail_url);
      }

      setNotice("Saving design details…");
      const query = editingId
        ? getClient().from("three_d_designs").update(payload).eq("id", editingId).select("id").maybeSingle()
        : getClient().from("three_d_designs").insert({ id, ...payload }).select("id").single();
      const { data, error } = await query;
      if (error) throw new Error(`Could not save 3D design: ${error.message}`);
      if (!data?.id) throw new Error("No design row was saved. Refresh the design list and try again.");
      committed = true;

      const oldImage = existing?.thumbnail_url !== payload.thumbnail_url
        ? existing?.thumbnail_url
        : "";
      resetForm();
      let cleanupError;
      try {
        await removeImages([oldImage]);
      } catch (error) {
        cleanupError = error;
        console.error("[3D designs] Old image cleanup failed.", error);
      }
      const refreshed = await loadDesigns(true);
      if (cleanupError) {
        setNotice(`${cleanupError.message} The design itself was saved.`, true);
      } else if (!refreshed) {
        setNotice("Design saved, but the list could not be refreshed. Use Refresh designs to retry.", true);
      } else {
        setNotice("Design saved.");
      }
    } catch (error) {
      if (!committed && uploadedPaths.length) {
        try {
          await removeImages(uploadedPaths);
        } catch (cleanupError) {
          console.error("[3D designs] Failed upload cleanup.", cleanupError);
          setNotice(`${error.message} Temporary image also needs cleanup: ${cleanupError.message}`, true);
          return;
        }
      }
      setNotice(error.message, true);
      console.error("[3D designs] Save failed.", error);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(id) {
    if (busy) return;
    const design = designs.find(item => item.id === id);
    if (!design) return;
    setBusy(true);
    try {
      await requireAdmin();
      const status = design.status === "published" ? "draft" : "published";
      if (status === "published" && !design.thumbnail_url) {
        throw new Error("Add a design image before publishing this entry.");
      }
      const { data, error } = await getClient()
        .from("three_d_designs")
        .update({ status })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Could not ${status === "published" ? "publish" : "unpublish"} design: ${error.message}`);
      if (!data?.id) throw new Error("No design status was changed. Refresh the design list and try again.");
      const refreshed = await loadDesigns(true);
      if (refreshed) setNotice(`Design ${status === "published" ? "published" : "unpublished"}.`);
      else setNotice("Design status saved, but the list could not be refreshed. Use Refresh designs to retry.", true);
    } catch (error) {
      setNotice(error.message, true);
      console.error("[3D designs] Publication update failed.", error);
    } finally {
      setBusy(false);
    }
  }

  async function deleteDesign(id) {
    if (busy) return;
    const design = designs.find(item => item.id === id);
    if (!design || !window.confirm(`Permanently delete "${design.title}" and its design image?`)) return;
    setBusy(true);
    try {
      await requireAdmin();
      const { data, error } = await getClient()
        .from("three_d_designs")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Could not delete design: ${error.message}`);
      if (!data?.id) throw new Error("No design was deleted. Refresh the design list and try again.");
      designs = designs.filter(item => item.id !== id);
      renderDesigns();
      try {
        await removeImages([design.thumbnail_url]);
      } catch (cleanupError) {
        setNotice(`Design deleted, but its image could not be removed: ${cleanupError.message}`, true);
        console.error("[3D designs] Deleted row but image cleanup failed.", cleanupError);
        return;
      }
      setNotice("Design and its image deleted.");
    } catch (error) {
      setNotice(error.message, true);
      console.error("[3D designs] Delete failed.", error);
    } finally {
      setBusy(false);
    }
  }

  form.addEventListener("submit", event => void saveDesign(event));
  cancelButton.addEventListener("click", resetForm);
  refreshButton.addEventListener("click", () => void loadDesigns());
  list.addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-design]");
    const toggle = event.target.closest("[data-toggle-design]");
    const remove = event.target.closest("[data-delete-design]");
    if (edit) startEditing(edit.dataset.editDesign);
    else if (toggle) void togglePublished(toggle.dataset.toggleDesign);
    else if (remove) void deleteDesign(remove.dataset.deleteDesign);
  });

  document.querySelector("#three-d-designs-tab").addEventListener("click", () => void loadDesigns());
})();
