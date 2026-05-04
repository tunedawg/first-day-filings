import { requireAuth, renderNav, supabase } from "/nav.js";

const PAGE_SIZE = 20;
let currentPage = 0;
let totalCount = 0;
let profile = null;

async function boot() {
  const auth = await requireAuth();
  if (!auth) return;
  profile = auth.profile;

  renderNav(profile, "dashboard");
  renderGreeting(profile);
  await loadCases();
  checkResumeBanner();
}

function renderGreeting(profile) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (profile.full_name || "").split(" ")[0];
  document.getElementById("dashGreeting").textContent = firstName ? `${greeting}, ${firstName}` : "Dashboard";

  // Load org name
  supabase.from("organizations").select("name").eq("id", profile.organization_id).single().then(({ data }) => {
    if (data?.name) document.getElementById("dashFirmName").textContent = data.name;
  });
}

async function loadCases() {
  const from = currentPage * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: cases, count, error } = await supabase
    .from("cases")
    .select("id, petitioner_name, respondent_name, status, drive_folder_url, created_at", { count: "exact" })
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .range(from, to);

  document.getElementById("dashLoading").hidden = true;
  document.getElementById("dashContent").hidden = false;

  if (error || !cases?.length) {
    document.getElementById("casesTableWrap").hidden = true;
    document.getElementById("dashEmpty").hidden = false;
    return;
  }

  totalCount = count || 0;
  renderTable(cases);
  renderPagination();
}

function renderTable(cases) {
  const tbody = document.getElementById("casesTableBody");
  tbody.innerHTML = cases.map((c) => {
    const petitioner = c.petitioner_name || "—";
    const respondent = c.respondent_name || "—";
    const statusBadge = statusBadgeHtml(c.status);
    const date = formatDate(c.created_at);
    const actionLink = c.drive_folder_url
      ? `<a class="case-action-link" href="${esc(c.drive_folder_url)}" target="_blank" rel="noopener">Open in Drive ↗</a>`
      : `<a class="case-action-link" href="/">Resume →</a>`;

    return `
      <tr>
        <td>
          <div class="case-names">${esc(petitioner)}</div>
          <div class="case-vs">v. ${esc(respondent)}</div>
        </td>
        <td>${statusBadge}</td>
        <td class="case-date">${date}</td>
        <td>${actionLink}</td>
      </tr>
    `;
  }).join("");
}

function statusBadgeHtml(status) {
  const map = {
    draft: ["Draft", "status-badge-draft"],
    generated: ["Generated", "status-badge-generated"],
    filed: ["Filed", "status-badge-filed"],
  };
  const [label, cls] = map[status] || ["Unknown", "status-badge-draft"];
  return `<span class="status-badge ${cls}">${label}</span>`;
}

function renderPagination() {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const pagination = document.getElementById("dashPagination");

  if (totalPages <= 1) { pagination.hidden = true; return; }

  pagination.hidden = false;
  document.getElementById("pageInfo").textContent = `Page ${currentPage + 1} of ${totalPages}`;
  document.getElementById("prevPageBtn").disabled = currentPage === 0;
  document.getElementById("nextPageBtn").disabled = currentPage >= totalPages - 1;
}

function checkResumeBanner() {
  try {
    const draft = JSON.parse(localStorage.getItem("first-day-filings:draft:v1") || "{}");
    const intake = draft.intake || {};
    const hasContent = Object.values(intake).some((v) => v && String(v).trim().length > 0);
    if (!hasContent) return;
    const name = [intake.plaintiffName, intake.defendantName].filter(Boolean).join(" v. ") || "Untitled draft";
    document.getElementById("resumeCaseName").textContent = name;
    document.getElementById("resumeBanner").hidden = false;
  } catch {}
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function esc(str) {
  return String(str || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

document.getElementById("prevPageBtn")?.addEventListener("click", async () => {
  if (currentPage > 0) { currentPage--; await loadCases(); }
});

document.getElementById("nextPageBtn")?.addEventListener("click", async () => {
  currentPage++;
  await loadCases();
});

boot();
