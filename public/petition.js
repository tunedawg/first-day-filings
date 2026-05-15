import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const uploadZone = document.getElementById("uploadZone");
const sourceFilesInput = document.getElementById("sourceFiles");
const uploadZoneLabel = document.getElementById("uploadZoneLabel");
const uploadFileList = document.getElementById("uploadFileList");
const extractButton = document.getElementById("extractButton");
const extractionError = document.getElementById("extractionError");
const extractionStatus = document.getElementById("extractionStatus");
const extractionStatusText = document.getElementById("extractionStatusText");
const extractionSummary = document.getElementById("extractionSummary");
const extractionSummaryTitle = document.getElementById("extractionSummaryTitle");
const extractionSummaryList = document.getElementById("extractionSummaryList");

const stepReview = document.getElementById("stepReview");
const petitionForm = document.getElementById("petitionForm");
const continueToGenerateBtn = document.getElementById("continueToGenerateBtn");

const stepGenerate = document.getElementById("stepGenerate");
const googleLoginButton = document.getElementById("googleLoginButton");
const googleLogoutButton = document.getElementById("googleLogoutButton");
const authSummary = document.getElementById("authSummary");
const authChipLabel = document.getElementById("authChipLabel");
const signInNotice = document.getElementById("signInNotice");
const generateSection = document.getElementById("generateSection");
const generateButton = document.getElementById("generateButton");
const statusBanner = document.getElementById("statusBanner");
const generationProgress = document.getElementById("generationProgress");
const generationProgressBar = document.getElementById("generationProgressBar");
const generationProgressLabel = document.getElementById("generationProgressLabel");
const resultsNode = document.getElementById("results");
const defendantCards = document.getElementById("defendantCards");
const addDefendantBtn = document.getElementById("addDefendantBtn");

// ── State ─────────────────────────────────────────────────────────────────────
let selectedFiles = [];
let defendants = [];
let _draftFacts = "";
let _draftIntroduction = "";
let authSession = null;
let _googleRefreshToken = null;
let _sb = null;
let _progressTimer = null;

// ── Supabase init ─────────────────────────────────────────────────────────────
function initSupabase() {
  const cfg = window.__FDF_CONFIG__;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) return;
  _sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
}

async function autoConnectGoogleDrive() {
  const cfg = window.__FDF_CONFIG__;
  if (!_sb || !cfg?.supabaseUrl) return;
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) return;

  const userEmail = session.user?.email || "";
  const refreshToken = session.provider_refresh_token || session.user?.user_metadata?.google_refresh_token;

  // Persist the refresh token into user_metadata so it survives future page loads.
  if (session.provider_refresh_token) {
    await _sb.auth.updateUser({ data: { google_refresh_token: session.provider_refresh_token } }).catch(() => {});
  }

  if (refreshToken) {
    _googleRefreshToken = refreshToken;
    setAuthState(true, userEmail);
  }
}

// ── Auth / Drive connection ───────────────────────────────────────────────────
function setAuthState(connected, label = "") {
  authSession = connected;
  if (connected) {
    authSummary.hidden = false;
    signInNotice.hidden = true;
    authChipLabel.textContent = label ? `${label} · Google Drive connected` : "Google Drive connected";
    generateSection.hidden = false;
  } else {
    authSummary.hidden = true;
    signInNotice.hidden = false;
    generateSection.hidden = false; // still show section so user sees the warning/button
  }
}

googleLoginButton?.addEventListener("click", () => {
  window.location.href = "/auth/google";
});

googleLogoutButton?.addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST" });
  setAuthState(false);
});

// Account bubble (top-right)
(async () => {
  initSupabase();
  if (!_sb) return;
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) return;

  const userBubble = document.getElementById("userBubble");
  const userBubbleAvatar = document.getElementById("userBubbleAvatar");
  const userBubbleName = document.getElementById("userBubbleName");
  const userBubbleTrigger = document.getElementById("userBubbleTrigger");
  const userBubbleDropdown = document.getElementById("userBubbleDropdown");
  const userBubbleSignOut = document.getElementById("userBubbleSignOut");

  if (userBubble) {
    const name = session.user.user_metadata?.name || session.user.email || "Account";
    const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    userBubbleAvatar.textContent = initials;
    userBubbleName.textContent = name;
    userBubble.hidden = false;

    userBubbleTrigger.addEventListener("click", () => {
      const open = !userBubbleDropdown.hidden;
      userBubbleDropdown.hidden = open;
      userBubbleTrigger.setAttribute("aria-expanded", String(!open));
    });
    document.addEventListener("click", (e) => {
      if (!userBubble.contains(e.target)) {
        userBubbleDropdown.hidden = true;
        userBubbleTrigger.setAttribute("aria-expanded", "false");
      }
    }, { capture: true });
    userBubbleSignOut.addEventListener("click", async () => {
      await _sb.auth.signOut();
      window.location.href = "/login";
    });
  }

  await autoConnectGoogleDrive();
})();

// ── File upload ───────────────────────────────────────────────────────────────
uploadZone.addEventListener("click", () => sourceFilesInput.click());
uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.classList.add("upload-zone--drag"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("upload-zone--drag"));
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("upload-zone--drag");
  handleFiles(Array.from(e.dataTransfer.files));
});
sourceFilesInput.addEventListener("change", () => handleFiles(Array.from(sourceFilesInput.files)));

function handleFiles(newFiles) {
  const existing = new Set(selectedFiles.map(f => f.name));
  for (const f of newFiles) {
    if (selectedFiles.length >= 10) break;
    if (!existing.has(f.name)) { selectedFiles.push(f); existing.add(f.name); }
  }
  sourceFilesInput.value = "";
  syncFileUI();
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  syncFileUI();
}

function syncFileUI() {
  if (selectedFiles.length === 0) {
    extractButton.disabled = true;
    uploadZoneLabel.textContent = "Drop files here, or click to browse";
    uploadFileList.hidden = true;
    return;
  }
  uploadZoneLabel.textContent = selectedFiles.length === 1 ? "1 file selected" : `${selectedFiles.length} files selected`;
  extractButton.disabled = false;
  renderFileList();
}

function renderFileList() {
  uploadFileList.innerHTML = selectedFiles.map((f, i) =>
    `<div class="upload-file-item">
      <span class="upload-file-name">${escapeHtml(f.name)}</span>
      <button type="button" class="upload-file-remove" data-index="${i}" title="Remove">×</button>
    </div>`
  ).join("");
  uploadFileList.hidden = false;
  uploadFileList.querySelectorAll(".upload-file-remove").forEach(btn => {
    btn.addEventListener("click", () => removeFile(Number(btn.dataset.index)));
  });
}

// ── Extract ───────────────────────────────────────────────────────────────────
extractButton.addEventListener("click", runExtraction);

async function runExtraction() {
  if (selectedFiles.length === 0) return;
  extractButton.disabled = true;
  extractionStatus.hidden = false;
  extractionSummary.hidden = true;
  extractionError.hidden = true;
  resetStep(stepReview);

  const filePayloads = await Promise.all(selectedFiles.map(async (file) => ({
    name: file.name,
    contentType: file.type || "application/octet-stream",
    contentBase64: await fileToBase64(file),
  })));

  try {
    const res = await fetch("/api/petition/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: filePayloads }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || "Extraction failed.");

    extractionStatus.hidden = true;
    showExtractionSummary(payload.summary || []);
    populateForm(payload.fields || {});
    unlockStep(stepReview);
    petitionForm.hidden = false;
    stepReview.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    extractionStatus.hidden = true;
    extractionError.textContent = err.message;
    extractionError.hidden = false;
    extractButton.disabled = false;
  }
}

function showExtractionSummary(summaryLines) {
  if (!summaryLines.length) return;
  extractionSummaryTitle.textContent = "Extracted from documents:";
  extractionSummaryList.innerHTML = summaryLines.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  extractionSummary.hidden = false;
}

// ── Populate form from extraction ─────────────────────────────────────────────
function populateForm(fields) {
  const court = fields.court || {};
  const plaintiff = fields.plaintiff || {};

  setField("pCourtCounty", court.county || "");
  setField("pCourtDivision", court.division || "");
  setField("pCaseType", fields.caseTypeLabel || "");
  setField("pFilingDate", "");
  setField("pFirmOffice", plaintiff.firmOffice === "stl" ? "stl" : "kc");
  setField("pCollectiveRef", fields.collectiveDefendantRef || "");

  setField("pPlaintiffCaptionName", plaintiff.captionName || "");
  setField("pPlaintiffFullName", plaintiff.fullName || "");
  setField("pPlaintiffRefName", plaintiff.refName || "");
  setField("pPlaintiffPronoun", plaintiff.pronoun || "she");

  // Defendants
  defendants = Array.isArray(fields.defendants) ? fields.defendants : [];
  renderDefendantCards();

  // Claims
  const claims = Array.isArray(fields.claims) ? fields.claims : [];
  document.querySelectorAll("#claimsGrid input[type='checkbox']").forEach((cb) => {
    cb.checked = claims.includes(cb.value);
  });

  // AI-drafted sections (counts are drafted separately after claims are finalized)
  _draftIntroduction = fields.introduction || "";
  _draftFacts = fields.facts || "";
  setField("pPartiesSection", fields.partiesSection || "");
  setField("pJurisdictionVenue", fields.jurisdictionVenue || "");
  setField("pCounts", "");
  setField("pPrayer", fields.prayer || "");

  // Document name
  const plaintiffLast = (plaintiff.fullName || "Plaintiff").split(" ").pop();
  const defRef = fields.collectiveDefendantRef || fields.defendants?.[0]?.refName || "Defendant";
  setField("pDocumentName", `${plaintiffLast}_${defRef} - Petition`);

  scheduleSave();
}

// ── Defendant cards ───────────────────────────────────────────────────────────
function renderDefendantCards() {
  defendantCards.innerHTML = "";
  defendants.forEach((d, i) => defendantCards.appendChild(makeDefendantCard(d, i)));
  scheduleSave();
}

function makeDefendantCard(d, index) {
  const card = document.createElement("div");
  card.className = "petition-defendant-card";
  card.dataset.index = index;
  card.innerHTML = `
    <div class="petition-defendant-card-header">
      <span class="petition-defendant-card-label">Defendant ${index + 1}</span>
      <button type="button" class="petition-remove-card-btn" data-index="${index}" title="Remove defendant">×</button>
    </div>
    <div class="field-grid">
      <div class="field">
        <label class="field-label">Caption Name (ALL CAPS)</label>
        <input type="text" class="def-captionName input-uppercase" value="${escapeHtml(d.captionName || "")}" placeholder="e.g., WALMART, INC." />
      </div>
      <div class="field">
        <label class="field-label">Short Reference Name</label>
        <input type="text" class="def-refName" value="${escapeHtml(d.refName || "")}" placeholder="e.g., Walmart" />
      </div>
      <div class="field">
        <label class="field-label">Serve Label</label>
        <select class="def-serveLabel">
          <option value="Serve at:" ${d.serveLabel === "Serve at:" ? "selected" : ""}>Serve at:</option>
          <option value="Serve RA:" ${d.serveLabel === "Serve RA:" ? "selected" : ""}>Serve RA: (Registered Agent)</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">State of Incorporation</label>
        <input type="text" class="def-incorporationState" value="${escapeHtml(d.incorporationState || "")}" placeholder="e.g., Delaware" />
      </div>
      <div class="field" style="grid-column: 1 / -1;">
        <label class="field-label">Service Address</label>
        <textarea class="def-serveAddress" rows="3" placeholder="Registered agent name\nStreet address\nCity, MO ZIP">${escapeHtml(d.serveAddress || "")}</textarea>
      </div>
    </div>
  `;
  card.querySelector(".petition-remove-card-btn").addEventListener("click", () => {
    defendants.splice(index, 1);
    renderDefendantCards();
  });
  return card;
}

addDefendantBtn.addEventListener("click", () => {
  defendants.push({ captionName: "", refName: "", serveLabel: "Serve at:", serveAddress: "", incorporationState: "" });
  renderDefendantCards();
  const lastCard = defendantCards.lastElementChild;
  lastCard?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  lastCard?.querySelector(".def-captionName")?.focus();
});

function collectDefendants() {
  return Array.from(defendantCards.querySelectorAll(".petition-defendant-card")).map((card) => ({
    captionName: card.querySelector(".def-captionName")?.value.trim() || "",
    refName: card.querySelector(".def-refName")?.value.trim() || "",
    serveLabel: card.querySelector(".def-serveLabel")?.value || "Serve at:",
    serveAddress: card.querySelector(".def-serveAddress")?.value.trim() || "",
    incorporationState: card.querySelector(".def-incorporationState")?.value.trim() || "",
  }));
}

// ── Draft Counts ──────────────────────────────────────────────────────────────
const draftCountsBtn    = document.getElementById("draftCountsBtn");
const draftCountsStatus = document.getElementById("draftCountsStatus");
const draftCountsError  = document.getElementById("draftCountsError");

draftCountsBtn?.addEventListener("click", async () => {
  const claims = Array.from(document.querySelectorAll("#claimsGrid input[type='checkbox']:checked")).map(cb => cb.value);
  if (claims.length === 0) {
    draftCountsError.textContent = "Select at least one claim before drafting counts.";
    draftCountsError.hidden = false;
    return;
  }
  if (!_draftFacts.trim()) {
    draftCountsError.textContent = "Run extraction first so the facts section is available.";
    draftCountsError.hidden = false;
    return;
  }

  draftCountsBtn.disabled = true;
  draftCountsStatus.hidden = false;
  draftCountsError.hidden = true;

  try {
    const res = await fetch("/api/petition/draft-counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claims,
        facts: _draftFacts,
        plaintiffRefName: document.getElementById("pPlaintiffRefName")?.value.trim() || "Plaintiff",
        collectiveDefendantRef: document.getElementById("pCollectiveRef")?.value.trim() || "Defendants",
      }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || "Counts drafting failed.");
    setField("pCounts", payload.counts);
    scheduleSave();
    document.getElementById("pCounts")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    draftCountsError.textContent = err.message;
    draftCountsError.hidden = false;
  } finally {
    draftCountsBtn.disabled = false;
    draftCountsStatus.hidden = true;
  }
});

// ── Step navigation ───────────────────────────────────────────────────────────
continueToGenerateBtn.addEventListener("click", () => {
  unlockStep(stepGenerate);
  stepGenerate.scrollIntoView({ behavior: "smooth", block: "start" });
});

function unlockStep(step) {
  step.classList.remove("wizard-step--locked");
  step.removeAttribute("aria-disabled");
}

function resetStep(step) {
  step.classList.add("wizard-step--locked");
  step.setAttribute("aria-disabled", "true");
}

// ── Generate ──────────────────────────────────────────────────────────────────
generateButton.addEventListener("click", runGenerate);

async function runGenerate() {
  generateButton.disabled = true;
  statusBanner.hidden = true;
  resultsNode.hidden = true;
  startProgress();

  const intake = collectIntake();
  if (_googleRefreshToken) intake._googleRefreshToken = _googleRefreshToken;

  try {
    const res = await fetch("/api/petition/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intake),
    });
    const payload = await res.json();
    stopProgress();
    if (!res.ok || !payload.ok) throw new Error(payload.error || "Generation failed.");
    showResults(payload);
  } catch (err) {
    stopProgress();
    showBanner(statusBanner, "error", err.message);
    generateButton.disabled = false;
  }
}


function collectIntake() {
  const claims = Array.from(document.querySelectorAll("#claimsGrid input[type='checkbox']:checked")).map((cb) => cb.value);
  const selectedAttorneys = Array.from(document.querySelectorAll("#pAttorneyRoster input[type='checkbox']:checked")).map((cb) => cb.value);

  return {
    court: {
      county: document.getElementById("pCourtCounty")?.value.trim() || "",
      division: document.getElementById("pCourtDivision")?.value.trim() || null,
      circuitLabel: null,
    },
    plaintiff: {
      captionName: document.getElementById("pPlaintiffCaptionName")?.value.trim() || "",
      fullName: document.getElementById("pPlaintiffFullName")?.value.trim() || "",
      refName: document.getElementById("pPlaintiffRefName")?.value.trim() || "",
      pronoun: document.getElementById("pPlaintiffPronoun")?.value || "she",
      firmOffice: document.getElementById("pFirmOffice")?.value || "kc",
    },
    defendants: collectDefendants(),
    collectiveDefendantRef: document.getElementById("pCollectiveRef")?.value.trim() || "",
    claims,
    caseTypeLabel: document.getElementById("pCaseType")?.value.trim() || null,
    filingDate: document.getElementById("pFilingDate")?.value.trim() || "",
    signingAttorney: document.getElementById("pSigningAttorney")?.value || "edward_keenan",
    selectedAttorneys,
    introduction: _draftIntroduction,
    partiesSection: document.getElementById("pPartiesSection")?.value || "",
    jurisdictionVenue: document.getElementById("pJurisdictionVenue")?.value || "",
    facts: _draftFacts,
    counts: document.getElementById("pCounts")?.value || "",
    prayer: document.getElementById("pPrayer")?.value || "",
    documentName: document.getElementById("pDocumentName")?.value.trim() || "Petition",
  };
}

function showResults(payload) {
  const items = (payload.documents || []).map((doc) => {
    if (doc.url) {
      return `<li><a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">${escapeHtml(doc.name || "Petition")}</a></li>`;
    }
    if (doc.downloadKey) {
      return `<li><a href="/api/download/${escapeHtml(doc.downloadKey)}" download="${escapeHtml(doc.name || "Petition")}.docx">${escapeHtml(doc.name || "Petition")} (download)</a></li>`;
    }
    return `<li>${escapeHtml(doc.name || "Petition")} — generated</li>`;
  }).join("");

  resultsNode.className = "results success";
  resultsNode.innerHTML = `<p style="font-weight:600;margin:0 0 6px;">Generated successfully</p><ul>${items}</ul>`;
  resultsNode.hidden = false;
  generateButton.disabled = false;
  resultsNode.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function startProgress() {
  generationProgress.hidden = false;
  let pct = 0;
  _progressTimer = setInterval(() => {
    pct = Math.min(pct + 2, 88);
    generationProgressBar.style.width = `${pct}%`;
    generationProgressLabel.textContent = pct < 40 ? "Copying template…" : pct < 75 ? "Replacing tokens…" : "Saving to Drive…";
  }, 200);
}

function stopProgress() {
  clearInterval(_progressTimer);
  generationProgressBar.style.width = "100%";
  setTimeout(() => { generationProgress.hidden = true; generationProgressBar.style.width = "0%"; }, 600);
}

// ── Persistence ───────────────────────────────────────────────────────────────
const STORAGE_KEY = "fdf-petition-draft-v1";
let _saveTimer = null;

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveFormState, 400);
}

function saveFormState() {
  if (petitionForm.hidden) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      pCourtCounty:          document.getElementById("pCourtCounty")?.value || "",
      pCourtDivision:        document.getElementById("pCourtDivision")?.value || "",
      pCaseType:             document.getElementById("pCaseType")?.value || "",
      pFilingDate:           document.getElementById("pFilingDate")?.value || "",
      pFirmOffice:           document.getElementById("pFirmOffice")?.value || "kc",
      pCollectiveRef:        document.getElementById("pCollectiveRef")?.value || "",
      pPlaintiffCaptionName: document.getElementById("pPlaintiffCaptionName")?.value || "",
      pPlaintiffFullName:    document.getElementById("pPlaintiffFullName")?.value || "",
      pPlaintiffRefName:     document.getElementById("pPlaintiffRefName")?.value || "",
      pPlaintiffPronoun:     document.getElementById("pPlaintiffPronoun")?.value || "she",
      pSigningAttorney:      document.getElementById("pSigningAttorney")?.value || "edward_keenan",
      pDocumentName:         document.getElementById("pDocumentName")?.value || "",
      claims:          Array.from(document.querySelectorAll("#claimsGrid input[type='checkbox']:checked")).map(cb => cb.value),
      selectedAttorneys: Array.from(document.querySelectorAll("#pAttorneyRoster input[type='checkbox']:checked")).map(cb => cb.value),
      defendants:      collectDefendants(),
      pPartiesSection:   document.getElementById("pPartiesSection")?.value || "",
      pJurisdictionVenue: document.getElementById("pJurisdictionVenue")?.value || "",
      pCounts:           document.getElementById("pCounts")?.value || "",
      pPrayer:           document.getElementById("pPrayer")?.value || "",
      draftFacts:        _draftFacts,
      draftIntroduction: _draftIntroduction,
      summaryLines: Array.from(document.querySelectorAll("#extractionSummaryList li")).map(li => li.textContent),
    }));
  } catch (_) {}
}

function loadFormState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);

    setField("pCourtCounty",          s.pCourtCounty || "");
    setField("pCourtDivision",        s.pCourtDivision || "");
    setField("pCaseType",             s.pCaseType || "");
    setField("pFilingDate",           s.pFilingDate || "");
    setField("pFirmOffice",           s.pFirmOffice || "kc");
    setField("pCollectiveRef",        s.pCollectiveRef || "");
    setField("pPlaintiffCaptionName", s.pPlaintiffCaptionName || "");
    setField("pPlaintiffFullName",    s.pPlaintiffFullName || "");
    setField("pPlaintiffRefName",     s.pPlaintiffRefName || "");
    setField("pPlaintiffPronoun",     s.pPlaintiffPronoun || "she");
    setField("pSigningAttorney",      s.pSigningAttorney || "edward_keenan");
    setField("pDocumentName",         s.pDocumentName || "");

    document.querySelectorAll("#claimsGrid input[type='checkbox']").forEach(cb => {
      cb.checked = (s.claims || []).includes(cb.value);
    });
    if (s.selectedAttorneys) {
      document.querySelectorAll("#pAttorneyRoster input[type='checkbox']").forEach(cb => {
        cb.checked = s.selectedAttorneys.includes(cb.value);
      });
    }

    defendants = s.defendants || [];
    renderDefendantCards();

    setField("pPartiesSection",   s.pPartiesSection || "");
    setField("pJurisdictionVenue", s.pJurisdictionVenue || "");
    setField("pCounts",           s.pCounts || "");
    setField("pPrayer",           s.pPrayer || "");
    _draftFacts = s.draftFacts || "";
    _draftIntroduction = s.draftIntroduction || "";

    if (s.summaryLines?.length) showExtractionSummary(s.summaryLines);

    unlockStep(stepReview);
    petitionForm.hidden = false;
  } catch (_) {}
}

function clearAllFields() {
  localStorage.removeItem(STORAGE_KEY);

  ["pCourtCounty","pCourtDivision","pCaseType","pCollectiveRef",
   "pPlaintiffCaptionName","pPlaintiffFullName","pPlaintiffRefName",
   "pPartiesSection","pJurisdictionVenue","pCounts","pPrayer","pDocumentName"
  ].forEach(id => setField(id, ""));
  setField("pFilingDate", "");
  setField("pFirmOffice", "kc");
  setField("pPlaintiffPronoun", "she");
  setField("pSigningAttorney", "edward_keenan");

  document.querySelectorAll("#claimsGrid input[type='checkbox']").forEach(cb => cb.checked = false);
  const defaultAttorneys = ["edward_keenan", "sonal_bhatia", "jr_montgomery", "aaron_hadlow"];
  document.querySelectorAll("#pAttorneyRoster input[type='checkbox']").forEach(cb => {
    cb.checked = defaultAttorneys.includes(cb.value);
  });

  defendants = [];
  renderDefendantCards();
  _draftFacts = "";
  _draftIntroduction = "";

  extractionSummary.hidden = true;
  extractionError.hidden = true;

  petitionForm.hidden = true;
  resetStep(stepReview);
  resetStep(stepGenerate);

  selectedFiles = [];
  syncFileUI();
}

document.getElementById("clearAllBtn")?.addEventListener("click", () => {
  if (petitionForm.hidden || confirm("Clear the current draft and start over?")) clearAllFields();
});

// Auto-save on any form input/change
document.addEventListener("input", (e) => {
  if (e.target.closest("#petitionForm, #generateSection")) scheduleSave();
});
document.addEventListener("change", (e) => {
  if (e.target.closest("#petitionForm, #generateSection")) scheduleSave();
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function setField(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === "SELECT") el.value = value;
  else el.value = value;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showBanner(el, type, message) {
  el.className = `status ${type}`;
  el.textContent = message;
  el.hidden = false;
}

loadFormState();
