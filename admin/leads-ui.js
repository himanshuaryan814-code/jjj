(() => {
  "use strict";

  const leadsList = document.querySelector("#leads-list");
  const toolbar = document.querySelector("#leads-toolbar");
  const searchInput = document.querySelector("#search-leads");
  const statusFilter = document.querySelector("#filter-lead-status");
  const selectPage = document.querySelector("#select-page-leads");
  const selectionCount = document.querySelector("#leads-selection-count");
  const deleteSelected = document.querySelector("#delete-selected-leads");
  const pagination = document.querySelector("#leads-pagination");
  const pageSummary = document.querySelector("#leads-page-summary");
  const pageStatus = document.querySelector("#leads-page-status");
  const previousPage = document.querySelector("#previous-leads-page");
  const nextPage = document.querySelector("#next-leads-page");
  const dashboardNotice = document.querySelector("#dashboard-notice");
  const pageSize = 5;
  const selectedLeadIds = new Set();
  let currentPage = 1;
  let leadRecords = [];
  let rendering = false;

  if (!leadsList || !toolbar || !searchInput || !statusFilter || !selectPage
    || !selectionCount || !deleteSelected || !pagination || !pageSummary
    || !pageStatus || !previousPage || !nextPage) {
    throw new Error("The Leads UI controls could not be initialized.");
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

  function textOf(element) {
    return element?.textContent?.trim() || "";
  }

  function valueFromMeta(metaText, label) {
    const labels = ["Project type", "Project location", "Budget", "Expected timeline"];
    const labelIndex = labels.indexOf(label);
    const followingLabels = labels.slice(labelIndex + 1).map(escapeRegExp).join("|");
    const end = followingLabels ? `(?=\\s*[·•]\\s*(?:${followingLabels})\\s*:|$)` : "(?=$)";
    const match = metaText.match(new RegExp(`${escapeRegExp(label)}\\s*:\\s*(.*?)${end}`));
    return match?.[1]?.trim() || "";
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function extractLead(card) {
    const leadId = card.querySelector("[data-delete-lead]")?.dataset.deleteLead
      || card.querySelector("[data-lead-id]")?.dataset.leadId
      || "";
    if (!leadId) return null;

    const contactLine = card.querySelector(".lead-contact-line");
    const meta = card.querySelector(".record-meta");
    const metaText = textOf(meta);
    const descriptions = [...card.querySelectorAll(".record-description")].map(textOf);
    const scope = descriptions.find(value => /^Work scope:/i.test(value)) || "";
    const message = descriptions.find(value => value && value !== scope) || "";
    const statusForm = card.querySelector("[data-lead-status-form]");
    const statusInput = statusForm?.querySelector('[name="status"]');
    const status = statusInput?.value || textOf(card.querySelector(".lead-status-badge"));

    return {
      id: leadId,
      name: textOf(card.querySelector(".record-title")) || "Enquiry",
      email: contactLine?.querySelector('a[href^="mailto:"]')?.textContent?.trim() || "",
      phone: contactLine?.querySelector('a[href^="tel:"]')?.textContent?.trim() || "",
      date: textOf(contactLine?.querySelector("span")),
      projectType: valueFromMeta(metaText, "Project type"),
      location: valueFromMeta(metaText, "Project location"),
      budget: valueFromMeta(metaText, "Budget"),
      timeline: valueFromMeta(metaText, "Expected timeline"),
      scope: scope.replace(/^Work scope:\s*/i, ""),
      message,
      status,
      statusColumn: statusForm?.dataset.statusColumn || ""
    };
  }

  function parseDate(value) {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function renderStatusOptions() {
    const statuses = [...new Set(leadRecords.map(lead => lead.status).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    const previousValue = statusFilter.value;
    statusFilter.replaceChildren(new Option("All statuses", ""));
    statuses.forEach(status => statusFilter.add(new Option(status, status)));
    if (statuses.includes(previousValue)) statusFilter.value = previousValue;
    else statusFilter.value = "";
    return statuses;
  }

  function getFilteredLeads() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const status = statusFilter.value;
    return leadRecords.filter(lead => {
      const matchesSearch = !query || [lead.name, lead.phone, lead.email]
        .some(value => value.toLocaleLowerCase().includes(query));
      const matchesStatus = !status || lead.status === status;
      return matchesSearch && matchesStatus;
    });
  }

  function renderLeadRow(lead) {
    const statusOptions = [...new Set(leadRecords.map(record => record.status).filter(Boolean))]
      .map(status => `<option value="${escapeHtml(status)}"></option>`).join("");
    const contact = [
      lead.email ? `<a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a>` : "",
      lead.phone ? `<a class="lead-phone" href="tel:${escapeHtml(lead.phone)}"><span aria-hidden="true">☎</span> ${escapeHtml(lead.phone)}</a>` : ""
    ].filter(Boolean).join("");
    const projectDetails = [
      lead.projectType ? `<span><b>Project</b>${escapeHtml(lead.projectType)}</span>` : "",
      lead.location ? `<span><b>Location</b>${escapeHtml(lead.location)}</span>` : "",
      lead.scope ? `<span class="lead-work-scope"><b>Scope</b>${escapeHtml(lead.scope)}</span>` : "",
      lead.message ? `<span class="lead-work-scope"><b>Message</b>${escapeHtml(lead.message)}</span>` : ""
    ].filter(Boolean).join("");
    const budgetDetails = [
      lead.budget ? `<span><b>Budget</b>${escapeHtml(lead.budget)}</span>` : "",
      lead.timeline ? `<span><b>Timeline</b>${escapeHtml(lead.timeline)}</span>` : ""
    ].filter(Boolean).join("");
    const statusEditor = lead.statusColumn
      ? `<span class="lead-status-badge${lead.status.toLowerCase() === "new" ? " is-new" : ""}">${escapeHtml(lead.status || "Not set")}</span>
        <form class="status-editor lead-row-status-form" data-lead-status-form data-lead-id="${escapeHtml(lead.id)}" data-status-column="${escapeHtml(lead.statusColumn)}">
          <label class="sr-only" for="lead-status-${escapeHtml(lead.id)}">Update status for ${escapeHtml(lead.name)}</label>
          <input id="lead-status-${escapeHtml(lead.id)}" name="status" list="lead-status-options-${escapeHtml(lead.id)}" value="${escapeHtml(lead.status)}" maxlength="80" required>
          <datalist id="lead-status-options-${escapeHtml(lead.id)}">${statusOptions}</datalist>
          <button class="button button-secondary" type="submit">Save</button>
        </form>`
      : `<span class="lead-status-badge">${escapeHtml(lead.status || "Not set")}</span>`;
    const dateTime = parseDate(lead.date)
      ? new Date(lead.date).toISOString()
      : "";

    return `<article class="record-card lead-card lead-row" data-lead-row="${escapeHtml(lead.id)}">
      <label class="lead-row-select">
        <input type="checkbox" data-select-lead="${escapeHtml(lead.id)}" aria-label="Select lead ${escapeHtml(lead.name)}">
      </label>
      <div class="lead-row-contact">
        <h3 class="record-title">${escapeHtml(lead.name)}</h3>
        ${contact ? `<div class="lead-row-contact-details">${contact}</div>` : ""}
        ${lead.date ? `<time class="lead-row-date"${dateTime ? ` datetime="${dateTime}"` : ""}>${escapeHtml(formatDate(lead.date))}</time>` : ""}
      </div>
      <div class="lead-row-project">${projectDetails || '<span class="lead-row-empty">No project details provided</span>'}</div>
      <div class="lead-row-budget">${budgetDetails}</div>
      <div class="lead-row-status">${statusEditor}</div>
      <div class="lead-row-actions">
        <button class="button button-danger-quiet lead-delete-button" type="button" data-delete-lead="${escapeHtml(lead.id)}" aria-label="Delete ${escapeHtml(lead.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"></path></svg>
          <span>Delete</span>
        </button>
      </div>
    </article>`;
  }

  function renderPage() {
    const filteredLeads = getFilteredLeads();
    const validIds = new Set(filteredLeads.map(lead => lead.id));
    for (const id of selectedLeadIds) {
      if (!validIds.has(id)) selectedLeadIds.delete(id);
    }

    const pageCount = Math.ceil(filteredLeads.length / pageSize);
    currentPage = Math.min(Math.max(currentPage, 1), Math.max(pageCount, 1));
    const start = (currentPage - 1) * pageSize;
    const pageLeads = filteredLeads.slice(start, start + pageSize);

    toolbar.hidden = leadRecords.length === 0;
    selectPage.checked = pageLeads.length > 0 && pageLeads.every(lead => selectedLeadIds.has(lead.id));
    selectPage.indeterminate = pageLeads.some(lead => selectedLeadIds.has(lead.id)) && !selectPage.checked;
    selectPage.disabled = pageLeads.length === 0;
    selectionCount.textContent = `${selectedLeadIds.size} selected`;
    deleteSelected.disabled = selectedLeadIds.size === 0;

    if (pageLeads.length) {
      leadsList.innerHTML = pageLeads.map(renderLeadRow).join("");
      const startNumber = start + 1;
      const endNumber = start + pageLeads.length;
      pageSummary.textContent = `Showing ${startNumber}–${endNumber} of ${filteredLeads.length} leads`;
      pageStatus.textContent = `Page ${currentPage} of ${pageCount}`;
      pagination.hidden = false;
      previousPage.disabled = currentPage === 1;
      nextPage.disabled = currentPage === pageCount;
    } else {
      const message = leadRecords.length
        ? "No leads match your search and status filters."
        : "New website enquiries will appear here.";
      leadsList.innerHTML = `<div class="empty-state" data-lead-empty><span class="empty-state-icon" aria-hidden="true">TA</span><strong>${escapeHtml(leadRecords.length ? "No matching enquiries" : "No enquiries yet")}</strong><span>${escapeHtml(message)}</span></div>`;
      pageSummary.textContent = `Showing 0 of ${filteredLeads.length} leads`;
      pageStatus.textContent = "";
      pagination.hidden = true;
    }
  }

  function renderFromExistingCards() {
    if (rendering) return;
    const currentRows = [...leadsList.querySelectorAll(".lead-row")];
    if (currentRows.length && currentRows.length === leadsList.children.length) return;

    const cards = [...leadsList.querySelectorAll(".lead-card")];
    if (!cards.length) {
      if (leadsList.querySelector(".empty-state")) {
        if (leadRecords.length) {
          leadRecords = [];
          renderStatusOptions();
          renderPage();
        } else if (!leadsList.querySelector("[data-lead-empty]")) {
          renderPage();
        }
      }
      return;
    }

    const records = cards.map(extractLead).filter(Boolean);
    records.sort((a, b) => parseDate(b.date) - parseDate(a.date));
    leadRecords = records;
    renderStatusOptions();
    rendering = true;
    try {
      renderPage();
    } finally {
      rendering = false;
    }
  }

  searchInput.addEventListener("input", () => {
    currentPage = 1;
    renderPage();
  });
  statusFilter.addEventListener("change", () => {
    currentPage = 1;
    renderPage();
  });
  selectPage.addEventListener("change", () => {
    const pageLeads = getFilteredLeads().slice((currentPage - 1) * pageSize, currentPage * pageSize);
    pageLeads.forEach(lead => {
      if (selectPage.checked) selectedLeadIds.add(lead.id);
      else selectedLeadIds.delete(lead.id);
    });
    renderPage();
  });
  leadsList.addEventListener("change", event => {
    const checkbox = event.target.closest("[data-select-lead]");
    if (!checkbox) return;
    if (checkbox.checked) selectedLeadIds.add(checkbox.dataset.selectLead);
    else selectedLeadIds.delete(checkbox.dataset.selectLead);
    renderPage();
  });
  previousPage.addEventListener("click", () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    renderPage();
  });
  nextPage.addEventListener("click", () => {
    const pageCount = Math.ceil(getFilteredLeads().length / pageSize);
    if (currentPage >= pageCount) return;
    currentPage += 1;
    renderPage();
  });
  deleteSelected.addEventListener("click", async () => {
    const ids = [...selectedLeadIds];
    if (!ids.length) return;
    const action = window.TARANGAN_LEAD_ADMIN_ACTIONS?.deleteSelectedLeads;
    if (typeof action !== "function") {
      dashboardNotice.textContent = "The secure lead deletion action is not ready. Refresh the admin panel and try again.";
      dashboardNotice.classList.add("is-error");
      return;
    }

    const originalLabel = deleteSelected.textContent;
    deleteSelected.disabled = true;
    deleteSelected.textContent = "Deleting…";
    try {
      const deletedCount = await action(ids);
      if (deletedCount) selectedLeadIds.clear();
    } catch (error) {
      dashboardNotice.textContent = `Selected leads were not deleted: ${error.message}`;
      dashboardNotice.classList.add("is-error");
      dashboardNotice.classList.remove("is-success", "is-loading");
    } finally {
      deleteSelected.textContent = originalLabel;
      deleteSelected.disabled = selectedLeadIds.size === 0;
    }
  });

  searchInput.disabled = false;
  statusFilter.disabled = false;
  new MutationObserver(renderFromExistingCards).observe(leadsList, { childList: true });
})();
