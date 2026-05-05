import { init as initHowTo, open as openHowTo } from "/how-to.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const questionnaireRoot = document.querySelector("#questionnaireRoot");
const generateButtons = Array.from(document.querySelectorAll("#generateButton"));
const validateTemplatesButton = document.querySelector("#validateTemplatesButton");
const extractButton = document.querySelector("#extractButton");
const sourceFilesInput = document.querySelector("#sourceFiles");
const extractionSummaryNode = document.querySelector("#extractionSummary");
const extractionSummaryList = document.querySelector("#extractionSummaryList");
const extractionSummaryTitle = document.querySelector("#extractionSummaryTitle");
const extractionStatusNode = document.querySelector("#extractionStatus");
const resultsNode = document.querySelector("#results");
const statusBanner = document.querySelector("#statusBanner");
const generationProgress = document.querySelector("#generationProgress");
const generationProgressBar = document.querySelector("#generationProgressBar");
const templateSelectionRoot = document.querySelector("#templateSelectionRoot");
const authSummary = document.querySelector("#authSummary");
const googleLoginButton = document.querySelector("#googleLoginButton");
const googleLogoutButton = document.querySelector("#googleLogoutButton");

const signInNotice = document.querySelector("#signInNotice");
const clearAllButton = document.querySelector("#clearAllButton");
const confirmModal = document.querySelector("#confirmModal");
const confirmModalCancel = document.querySelector("#confirmModalCancel");
const confirmModalConfirm = document.querySelector("#confirmModalConfirm");

// Wizard step elements
const stepDetails = document.querySelector("#stepDetails");
const stepGenerate = document.querySelector("#stepGenerate");
const applyAndGenerateButton = document.querySelector("#applyAndGenerateButton");
const applyAndReviewButton = document.querySelector("#applyAndReviewButton");
const skipToManualButton = document.querySelector("#skipToManualButton");
const continueToGenerateButton = document.querySelector("#continueToGenerateButton");
const uploadZoneLabel = document.querySelector("#uploadZoneLabel");

const UPPERCASE_FIELD_IDS = new Set([
  "courtCounty", "courtDivision", "plaintiffName", "defendantName",
  "caseNumber", "allDefendants", "judgeName", "protectiveOrderActionCaseNumber",
]);

let questionnaire = null;
let templates = [];
let extractedPayload = null;
let authSession = null;
let generationProgressTimer = null;
let _generateFormat = "docs";
let _emailOnlyMode = false;
let _omnibusDeponentCount = 0;
const DRAFT_STORAGE_KEY = "first-day-filings:draft:v1";

// ── Supabase case persistence (optional — gracefully no-ops if not logged in) ──
let _sb = null;
let _sbProfile = null;
let _activeCaseId = null;
let _saveCaseTimer = null;

let _orgAttorneys = [];

async function initCasePersistence(sbClient, session) {
  // Accept pre-initialized client+session from auth gate, or init fresh.
  if (sbClient && session) {
    _sb = sbClient;
  } else {
    const cfg = window.__FDF_CONFIG__;
    if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) return;
    _sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { data: { session: s } } = await _sb.auth.getSession();
    if (!s) return;
    session = s;
  }

  const { data: profile } = await _sb.from("profiles").select("id, organization_id, full_name, role").eq("id", session.user.id).maybeSingle();
  if (!profile?.organization_id) return;
  _sbProfile = profile;

  // Fetch org attorneys for questionnaire dropdown and generate request.
  const token = session.access_token;
  const res = await fetch("/api/attorneys", { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) {
    const data = await res.json();
    if (data.attorneys?.length) {
      _orgAttorneys = data.attorneys;
      patchAttorneyOptions(data.attorneys);
    }
  }
}

function patchAttorneyOptions(attorneys) {
  if (!questionnaire) return;
  const section = questionnaire.sections.find((s) => s.id === "attorneys");
  if (!section) return;

  const signingField = section.fields.find((f) => f.id === "signingAttorney");
  const rosterField = section.fields.find((f) => f.id === "includedAttorneys");

  if (signingField) {
    signingField.options = attorneys.map((a) => ({ value: a.id, label: a.full_name }));
  }

  if (rosterField) {
    rosterField.options = attorneys.map((a) => ({
      value: a.id,
      label: a.full_name,
      description: `Mo. #${a.bar_number}${a.email ? " · " + a.email : ""}`,
      checked: true,
    }));
  }

  // Re-render the attorneys section with updated options.
  if (questionnaire) renderQuestionnaire(questionnaire);
}

async function ensureCase() {
  if (!_sb || !_sbProfile) return;
  if (_activeCaseId) return;
  const intake = collectIntake();
  const { data, error } = await _sb.from("cases").insert({
    organization_id: _sbProfile.organization_id,
    created_by: _sbProfile.id,
    petitioner_name: intake.plaintiffName || null,
    respondent_name: intake.defendantName || null,
    intake_fields: intake,
    status: "draft",
  }).select("id").single();
  if (!error && data) _activeCaseId = data.id;
}

function scheduleCaseSave() {
  if (!_sb || !_sbProfile) return;
  clearTimeout(_saveCaseTimer);
  _saveCaseTimer = setTimeout(async () => {
    if (!_activeCaseId) { await ensureCase(); return; }
    const intake = collectIntake();
    await _sb.from("cases").update({
      petitioner_name: intake.plaintiffName || null,
      respondent_name: intake.defendantName || null,
      intake_fields: intake,
    }).eq("id", _activeCaseId);
  }, 2000);
}

async function markCaseGenerated(folderUrl) {
  if (!_sb || !_activeCaseId) return;
  await _sb.from("cases").update({ status: "generated", drive_folder_url: folderUrl }).eq("id", _activeCaseId);
}

function logEvent(action, metadata = {}) {
  if (!_sb || !_sbProfile) return;
  _sb.from("events").insert({
    case_id: _activeCaseId || null,
    user_id: _sbProfile.id,
    action,
    metadata,
  }).then(() => {});
}

async function uploadPetitionFiles(files) {
  if (!_sb || !_sbProfile) return;
  // Ensure the case exists before uploading.
  if (!_activeCaseId) await ensureCase();
  if (!_activeCaseId) return;

  const orgId = _sbProfile.organization_id;
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${orgId}/${_activeCaseId}/${safeName}`;
    const { error: uploadErr } = await _sb.storage.from("petition-uploads").upload(storagePath, file, { upsert: true });
    if (uploadErr) continue;
    await _sb.from("uploads").insert({ case_id: _activeCaseId, storage_path: storagePath, original_filename: file.name });
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function loadDraft() {
  try {
    return asObject(JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || "{}"));
  } catch {
    return {};
  }
}

function loadDraftUi() {
  return asObject(loadDraft().ui);
}

function saveDraft() {
  const draft = {
    intake: collectIntake(),
    selectedTemplateIds: collectSelectedTemplates(),
    ui: loadDraftUi(),
  };

  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  scheduleCaseSave();
}

function setDraftUiValue(key, value) {
  const draft = loadDraft();
  const nextUi = {
    ...asObject(draft.ui),
    [key]: value,
  };

  window.localStorage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify({
      ...draft,
      intake: collectIntake(),
      selectedTemplateIds: collectSelectedTemplates(),
      ui: nextUi,
    }),
  );
}

function applyDraftToTemplates() {
  const draft = loadDraft();
  const selectedTemplateIds = new Set(asArray(draft.selectedTemplateIds));
  if (selectedTemplateIds.size === 0) {
    return;
  }

  templateSelectionRoot.querySelectorAll('input[name="selectedTemplateIds"]').forEach((node) => {
    node.checked = selectedTemplateIds.has(node.value);
  });
}

function applyDraftToIntake() {
  const draft = loadDraft();
  const intake = asObject(draft.intake);

  // Pre-create omnibus deponent cards to match the saved count.
  const savedCount = Math.max(1, Math.min(8, Number(intake.omnibusDeponentCount || 1)));
  if (savedCount > _omnibusDeponentCount) {
    while (_omnibusDeponentCount < savedCount) omnibusCreateCard();
    updateOmnibusRemoveButtons();
    bindConditionalFields();
  }

  Object.entries(intake).forEach(([key, value]) => {
    const timeField = questionnaireRoot.querySelector(`input[data-time-part="clock"][name="${key}"]`);
    if (timeField) {
      timeField.value = "";
      const wrapper = timeField.closest(".field");
      const timeInput = wrapper?.querySelector('input[data-time-part="clock"]');
      const meridiem = wrapper?.querySelector('select[data-time-part="meridiem"]');
      const timezone = wrapper?.querySelector('select[data-time-part="timezone"]');

      if (timeInput && meridiem && timezone) {
        const normalized = normalizeStoredTimeValue(value);
        timeInput.value = normalized.clock;
        meridiem.value = normalized.meridiem;
        timezone.value = normalized.timezone;
      }
      return;
    }

    const checkboxNodes = questionnaireRoot.querySelectorAll(`input[type="checkbox"][name="${key}"]`);
    if (checkboxNodes.length > 1) {
      const selectedValues = new Set(asArray(value).map(String));
      checkboxNodes.forEach((node) => {
        node.checked = selectedValues.has(node.value);
      });
      return;
    }

    const field = questionnaireRoot.querySelector(`[name="${key}"]`);
    if (!field) {
      return;
    }

    if (field.type === "checkbox") {
      field.checked = Boolean(value);
      return;
    }

    field.value = value ?? "";
  });

  updateConditionalFields();
  updateOmnibusLocationVisibility();
  syncProtectiveOrderDefaults();
}

function setStatus(message, mode = "idle") {
  if (!statusBanner) {
    return;
  }

  statusBanner.textContent = message;
  statusBanner.className = `status ${mode}`;
}

function setExtractionStatus(message, mode = "") {
  if (!extractionStatusNode) return;
  if (!message) {
    extractionStatusNode.hidden = true;
    return;
  }
  extractionStatusNode.textContent = message;
  extractionStatusNode.className = `extraction-status ${mode}`;
  extractionStatusNode.hidden = false;
}

function setGenerateButtonsDisabled(disabled) {
  generateButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function setTemplateValidationDisabled(disabled) {
  if (validateTemplatesButton) {
    validateTemplatesButton.disabled = disabled;
  }
}

function setProgressValue(value) {
  if (!generationProgress || !generationProgressBar) {
    return;
  }

  const normalized = Math.max(0, Math.min(100, Number(value) || 0));
  generationProgress.hidden = false;
  generationProgressBar.style.width = `${normalized}%`;
}

function stopGenerationProgress(finalValue = 100) {
  if (generationProgressTimer) {
    window.clearInterval(generationProgressTimer);
    generationProgressTimer = null;
  }

  setProgressValue(finalValue);

  window.setTimeout(() => {
    if (generationProgress) {
      generationProgress.hidden = true;
    }
  }, 600);
}

function startGenerationProgress() {
  if (generationProgressTimer) {
    window.clearInterval(generationProgressTimer);
  }

  let progress = 8;
  setProgressValue(progress);

  generationProgressTimer = window.setInterval(() => {
    progress = Math.min(progress + (progress < 65 ? 9 : 4), 92);
    setProgressValue(progress);
  }, 240);
}

function updateAuthUi() {
  if (!authSession?.configured) {
    if (authSummary) authSummary.textContent = "Google OAuth not configured";
    if (googleLoginButton) googleLoginButton.hidden = true;
    if (googleLogoutButton) googleLogoutButton.hidden = true;
    setGenerateButtonsDisabled(true);
    setTemplateValidationDisabled(true);
    return;
  }

  if (authSession.signedIn) {
    if (authSummary) authSummary.textContent = `Connected as ${authSession.user?.email || authSession.user?.name || "Google user"}`;
    if (googleLoginButton) googleLoginButton.hidden = true;
    if (googleLogoutButton) googleLogoutButton.hidden = false;
    if (signInNotice) signInNotice.hidden = true;
    setGenerateButtonsDisabled(false);
    setTemplateValidationDisabled(false);
    setStatus("Ready to generate.", "success");
    return;
  }

  if (authSummary) authSummary.textContent = "Connect Google Drive to generate documents";
  if (googleLoginButton) googleLoginButton.hidden = false;
  if (googleLogoutButton) googleLogoutButton.hidden = true;
  if (signInNotice) signInNotice.hidden = false;
  setGenerateButtonsDisabled(true);
  setTemplateValidationDisabled(true);
}

function syncProtectiveOrderDefaults() {
  const caseNumberField = questionnaireRoot.querySelector('[name="caseNumber"]');
  const poCaseNumberField = questionnaireRoot.querySelector('[name="protectiveOrderActionCaseNumber"]');
  const poCaptionField = questionnaireRoot.querySelector('[name="protectiveOrderActionCaption"]');

  if (poCaseNumberField && !poCaseNumberField.value.trim() && caseNumberField?.value.trim()) {
    poCaseNumberField.value = caseNumberField.value.toUpperCase();
  }

  if (poCaptionField && !poCaptionField.value.trim()) {
    const plaintiffRaw = (questionnaireRoot.querySelector('[name="plaintiffName"]')?.value || "").trim();
    const parts = plaintiffRaw.split(/\s+/).filter(Boolean);
    const lastName = parts.length > 0
      ? parts[parts.length - 1].toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
      : "";
    const defShort = (
      questionnaireRoot.querySelector('[name="collectiveDefendantShortName"]')?.value.trim() ||
      questionnaireRoot.querySelector('[name="defendantReferenceName"]')?.value.trim() ||
      questionnaireRoot.querySelector('[name="defendantName"]')?.value.trim() ||
      ""
    );
    if (lastName && defShort) {
      poCaptionField.value = `${lastName} v. ${defShort}`;
    }
  }
}

function createField(field) {
  if (field.id && /Time$/.test(field.id) && (field.id.startsWith("omnibusDeponent") || field.id === "corpRepTime")) {
    return createTimeField(field);
  }

  if (field.type === "section-header") {
    return createSectionHeader(field);
  }

  if (field.type === "checkbox-group") {
    return createCheckboxGroup(field);
  }

  if (field.type === "checkbox") {
    return createSingleCheckbox(field);
  }

  const wrapper = document.createElement("label");
  wrapper.className = "field";
  if (field.showIf) {
    wrapper.dataset.showIf = JSON.stringify(field.showIf);
  }

  const label = document.createElement("span");
  label.className = "field-label";
  label.textContent = field.label;
  wrapper.appendChild(label);

  let input;

  if (field.type === "textarea") {
    input = document.createElement("textarea");
  } else if (field.type === "select") {
    input = document.createElement("select");
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Select one";
    input.appendChild(emptyOption);

    (field.options || []).forEach((option) => {
      const optionNode = document.createElement("option");
      optionNode.value = option.value;
      optionNode.textContent = option.label;
      input.appendChild(optionNode);
    });
  } else {
    input = document.createElement("input");
  }

  input.name = field.id;
  input.required = false;
  input.placeholder = field.placeholder || "";

  if (field.type !== "textarea" && field.type !== "select") {
    input.type = field.type || "text";
  } else if (field.type === "textarea") {
    input.rows = Number(field.rows || 4);
  }

  if (UPPERCASE_FIELD_IDS.has(field.id)) {
    input.classList.add("input-uppercase");
  }

  wrapper.appendChild(input);
  return wrapper;
}

function createTimeField(field) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  if (field.showIf) {
    wrapper.dataset.showIf = JSON.stringify(field.showIf);
  }

  const label = document.createElement("span");
  label.className = "field-label";
  label.textContent = field.label;
  wrapper.appendChild(label);

  const timeInput = document.createElement("input");
  timeInput.type = "text";
  timeInput.name = field.id;
  timeInput.placeholder = "10:00";
  timeInput.inputMode = "numeric";
  timeInput.dataset.timePart = "clock";

  const meridiem = document.createElement("select");
  meridiem.dataset.timePart = "meridiem";
  ["AM", "PM"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    meridiem.appendChild(option);
  });

  const timezone = document.createElement("select");
  timezone.dataset.timePart = "timezone";
  ["CT", "ET"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    timezone.appendChild(option);
  });

  const normalized = normalizeStoredTimeValue(field.value || "");
  timeInput.value = normalized.clock;
  meridiem.value = normalized.meridiem;
  timezone.value = normalized.timezone;

  const controls = document.createElement("div");
  controls.className = "time-field";
  controls.appendChild(timeInput);
  controls.appendChild(meridiem);
  controls.appendChild(timezone);

  timeInput.addEventListener("input", () => {
    timeInput.value = timeInput.value.replace(/[^\d:]/g, "");
  });
  timeInput.addEventListener("change", () => {
    timeInput.value = formatClockInput(timeInput.value);
  });
  timeInput.addEventListener("blur", () => {
    timeInput.value = formatClockInput(timeInput.value);
  });

  wrapper.appendChild(controls);
  return wrapper;
}

function normalizeStoredTimeValue(rawValue) {
  const value = String(rawValue || "").trim();
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?(?:\s*(ET|CT))?$/i.exec(value);
  if (!match) {
    return { clock: "", meridiem: "AM", timezone: "CT" };
  }

  const hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = (match[3] || "AM").toUpperCase();
  const timezone = (match[4] || "CT").toUpperCase();

  return { clock: `${hours}:${minutes}`, meridiem, timezone };
}

function composeStoredTimeValue(clockValue, meridiem, timezone) {
  const trimmedClock = formatClockInput(clockValue);
  if (!trimmedClock) {
    return "";
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmedClock);
  if (!match) {
    return trimmedClock;
  }

  const hours = Number(match[1]);
  const minutes = match[2];
  const normalizedMeridiem = (meridiem || "AM").toUpperCase();
  const normalizedTimezone = (timezone || "CT").toUpperCase();

  if (hours < 1 || hours > 12) {
    return trimmedClock;
  }

  return `${hours}:${minutes} ${normalizedMeridiem} ${normalizedTimezone}`;
}

function formatClockInput(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  if (/^\d{1,2}:\d{2}$/.test(value)) {
    return value;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length === 3) {
    return `${digits.slice(0, 1)}:${digits.slice(1)}`;
  }

  if (digits.length === 4) {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  return value;
}

function renderTemplateSelection() {
  templateSelectionRoot.innerHTML = "";

  asArray(templates).forEach((template) => {
    const label = document.createElement("label");
    label.className = "template-option";
    label.innerHTML = `
      <input type="checkbox" name="selectedTemplateIds" value="${template.id}" checked />
      <div class="template-option-copy">
        <strong>${template.title}</strong>
        <p>${template.description}</p>
      </div>
    `;
    templateSelectionRoot.appendChild(label);
  });

  applyDraftToTemplates();
}

function createSectionHeader(field) {
  const wrapper = document.createElement("div");
  wrapper.className = "field-group-header";
  wrapper.innerHTML = `
    <h3>${field.label}</h3>
    ${field.description ? `<p>${field.description}</p>` : ""}
  `;
  return wrapper;
}

function createChecklistWorkflow(headerField, fieldPairs) {
  const wrapper = document.createElement("section");
  wrapper.className = "field-workflow";
  wrapper.dataset.workflowKey = headerField.id;

  const header = document.createElement("div");
  header.className = "field-group-header";
  header.innerHTML = `
    <h3>${headerField.label}</h3>
    ${headerField.description ? `<p>${headerField.description}</p>` : ""}
  `;
  wrapper.appendChild(header);

  const checklist = document.createElement("div");
  checklist.className = "field-workflow-checklist checkbox-grid";
  fieldPairs.forEach(([toggleField]) => {
    checklist.appendChild(createChecklistOption(toggleField));
  });
  wrapper.appendChild(checklist);

  const actions = document.createElement("div");
  actions.className = "field-workflow-actions";

  const doneButton = document.createElement("button");
  doneButton.type = "button";
  doneButton.className = "action-secondary action-sm";
  doneButton.textContent = "Done";
  actions.appendChild(doneButton);
  wrapper.appendChild(actions);

  const details = document.createElement("div");
  details.className = "field-workflow-details";
  details.hidden = !Boolean(loadDraftUi()[headerField.id]);
  wrapper.appendChild(details);

  doneButton.addEventListener("click", () => {
    renderWorkflowDetails(details, fieldPairs);
    details.hidden = false;
    updateConditionalFields();
    bindConditionalFields();
    applyDraftToIntake();
    setDraftUiValue(headerField.id, true);
    saveDraft();
  });

  if (!details.hidden) {
    renderWorkflowDetails(details, fieldPairs);
  }

  return wrapper;
}

function createChecklistOption(field) {
  const wrapper = document.createElement("label");
  wrapper.className = "checkbox-option";
  if (field.showIf) {
    wrapper.dataset.showIf = JSON.stringify(field.showIf);
  }

  wrapper.innerHTML = `
    <input type="checkbox" name="${field.id}" ${field.checked ? "checked" : ""} />
    <div>
      <strong>${field.label}</strong>
    </div>
  `;

  return wrapper;
}

function renderWorkflowDetails(container, fieldPairs) {
  container.innerHTML = "";

  fieldPairs.forEach(([toggleField, detailField]) => {
    const toggle = questionnaireRoot.querySelector(`[name="${toggleField.id}"]`);
    if (!toggle?.checked) {
      return;
    }

    const fieldNode = createField(detailField);
    fieldNode.hidden = false;
    fieldNode.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = false;
    });
    container.appendChild(fieldNode);
  });
}

function renderStandardSectionFields(fields, grid) {
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];

    if (
      field.type === "section-header" &&
      (field.id === "comparatorGroupHeader" || field.id === "decisionMakerHeader")
    ) {
      const pairs = [];
      let pairIndex = index + 1;

      while (pairIndex + 1 < fields.length && fields[pairIndex].type !== "section-header") {
        pairs.push([fields[pairIndex], fields[pairIndex + 1]]);
        pairIndex += 2;
      }

      grid.appendChild(createChecklistWorkflow(field, pairs));
      index = pairIndex - 1;
      continue;
    }

    grid.appendChild(createField(field));
  }
}

function createCheckboxGroup(field) {
  const wrapper = document.createElement("fieldset");
  wrapper.className = "field checkbox-group";
  wrapper.dataset.fieldId = field.id;
  wrapper.dataset.required = String(Boolean(field.required));
  if (field.showIf) {
    wrapper.dataset.showIf = JSON.stringify(field.showIf);
  }

  const legend = document.createElement("legend");
  legend.className = "field-label";
  legend.textContent = field.label;
  wrapper.appendChild(legend);

  const optionGrid = document.createElement("div");
  optionGrid.className = "checkbox-grid";

  (field.options || []).forEach((option) => {
    const optionLabel = document.createElement("label");
    optionLabel.className = "checkbox-option";
    optionLabel.innerHTML = `
      <input type="checkbox" name="${field.id}" value="${option.value}" ${option.checked ? "checked" : ""} />
      <div>
        <strong>${option.label}</strong>
        ${option.description ? `<p>${option.description}</p>` : ""}
      </div>
    `;
    optionGrid.appendChild(optionLabel);
  });

  wrapper.appendChild(optionGrid);
  return wrapper;
}

function createSingleCheckbox(field) {
  const wrapper = document.createElement("label");
  wrapper.className = "field single-checkbox";
  if (field.showIf) {
    wrapper.dataset.showIf = JSON.stringify(field.showIf);
  }

  wrapper.innerHTML = `
    <span class="field-label">${field.label}</span>
    <span class="checkbox-inline">
      <input type="checkbox" name="${field.id}" ${field.checked ? "checked" : ""} />
      <span>Yes</span>
    </span>
  `;

  return wrapper;
}

const GUIDED_FLOW_SECTIONS = [
  "caption",
  "attorneys",
  "omnibusDepositions",
  "corpRep",
  "discoveryLists",
  "protectiveOrder",
];

function renderQuestionnaire() {
  questionnaireRoot.innerHTML = "";

  for (const section of asArray(questionnaire?.sections)) {
    const sectionNode = document.createElement("section");
    sectionNode.className = "panel";
    sectionNode.id = "qs-" + section.id;

    const header = document.createElement("div");
    header.className = "panel-header stacked";
    header.innerHTML = `<div><h2>${section.title}</h2><p>${section.description}</p></div>`;
    sectionNode.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "field-grid";
    grid.dataset.section = section.id;

    if (section.id === "omnibusDepositions") {
      renderOmnibusFields(section, grid);
    } else {
      renderStandardSectionFields(asArray(section.fields), grid);
    }

    sectionNode.appendChild(grid);
    questionnaireRoot.appendChild(sectionNode);
  }

  buildGuidedFlow();
  bindConditionalFields();
  updateConditionalFields();
  updateOmnibusLocationVisibility();
  applyDraftToIntake();
}

function buildGuidedFlow() {
  GUIDED_FLOW_SECTIONS.forEach((sectionId, index) => {
    const panel = document.querySelector(`#qs-${sectionId}`);
    if (!panel) return;

    const foot = document.createElement("div");
    foot.className = "step-foot";

    const isLast = index === GUIDED_FLOW_SECTIONS.length - 1;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-primary";
    btn.textContent = isLast ? "Continue to Generate →" : "Next →";

    btn.addEventListener("click", () => {
      saveDraft();
      if (isLast) {
        stepGenerate?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        const nextId = GUIDED_FLOW_SECTIONS[index + 1];
        document.querySelector(`#qs-${nextId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    foot.appendChild(btn);
    panel.appendChild(foot);
  });
}

function renderOmnibusFields(section, grid) {
  // Hidden input tracks the count for collectIntake() and the generator.
  const countInput = document.createElement("input");
  countInput.type = "hidden";
  countInput.name = "omnibusDeponentCount";
  countInput.value = "1";
  grid.appendChild(countInput);

  const cardsContainer = document.createElement("div");
  cardsContainer.id = "omnibusCardsContainer";
  cardsContainer.className = "omnibus-cards";
  grid.appendChild(cardsContainer);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "action-secondary action-sm omnibus-add-btn";
  addBtn.textContent = "+ Add Deponent";
  addBtn.addEventListener("click", omnibusAddDeponent);
  grid.appendChild(addBtn);

  // Start with one card. Inline creation here because the container isn't in
  // the main document yet, so document.getElementById would return null.
  _omnibusDeponentCount = 1;
  cardsContainer.appendChild(createOmnibusCard(1));
}

function createOmnibusCard(index) {
  const card = document.createElement("section");
  card.className = "omnibus-card";
  card.dataset.deponentIndex = String(index);

  const header = document.createElement("div");
  header.className = "omnibus-card-header";

  const titleText = document.createElement("h3");
  titleText.className = "omnibus-card-title";
  titleText.textContent = `Deponent ${index}`;
  header.appendChild(titleText);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "action-secondary action-sm omnibus-remove-btn";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => omnibusRemoveDeponent(card));
  header.appendChild(removeBtn);

  card.appendChild(header);

  const cardGrid = document.createElement("div");
  cardGrid.className = "omnibus-card-grid";

  cardGrid.appendChild(createField({ id: `omnibusDeponent${index}Name`, label: "Name", type: "text", placeholder: "Deponent name" }));
  cardGrid.appendChild(createField({ id: `omnibusDeponent${index}Date`, label: "Date", type: "date" }));
  cardGrid.appendChild(createField({ id: `omnibusDeponent${index}Time`, label: "Time", type: "text", placeholder: "10:00 AM CT" }));

  const toggleField = { id: `omnibusDeponent${index}InPerson`, label: "Not via Zoom (in-person)", type: "checkbox" };
  const locationField = { id: `omnibusDeponent${index}Location`, label: "Location", type: "textarea", rows: 3, placeholder: "4600 Madison Ave. Ste. 810\nKansas City, MO 64112" };
  cardGrid.appendChild(createOmnibusLocationWorkflow(index, toggleField, locationField));

  card.appendChild(cardGrid);
  return card;
}

// Creates a new card without triggering save/rebind (used during batch init/restore).
function omnibusCreateCard() {
  const container = document.getElementById("omnibusCardsContainer");
  if (!container || _omnibusDeponentCount >= 8) return;
  _omnibusDeponentCount++;
  container.appendChild(createOmnibusCard(_omnibusDeponentCount));
  const countInput = questionnaireRoot.querySelector('[name="omnibusDeponentCount"]');
  if (countInput) countInput.value = String(_omnibusDeponentCount);
  updateOmnibusAddButtonState();
}

function omnibusAddDeponent() {
  if (_omnibusDeponentCount >= 8) return;
  omnibusCreateCard();
  updateOmnibusRemoveButtons();
  bindConditionalFields();
  saveDraft();
}

function omnibusRemoveDeponent(card) {
  const container = document.getElementById("omnibusCardsContainer");
  if (!container || container.children.length <= 1) return;

  const removedIndex = Number(card.dataset.deponentIndex);
  card.remove();
  _omnibusDeponentCount--;

  // Renumber cards after the removed one.
  Array.from(container.querySelectorAll(".omnibus-card")).forEach((c, i) => {
    const newIndex = i + 1;
    const oldIndex = Number(c.dataset.deponentIndex);
    if (oldIndex !== newIndex) renumberOmnibusCard(c, oldIndex, newIndex);
  });

  const countInput = questionnaireRoot.querySelector('[name="omnibusDeponentCount"]');
  if (countInput) countInput.value = String(_omnibusDeponentCount);

  updateOmnibusRemoveButtons();
  updateOmnibusAddButtonState();
  saveDraft();
}

function renumberOmnibusCard(card, oldIndex, newIndex) {
  card.dataset.deponentIndex = String(newIndex);
  const title = card.querySelector(".omnibus-card-title");
  if (title) title.textContent = `Deponent ${newIndex}`;

  card.querySelectorAll("[name]").forEach((el) => {
    el.name = el.name.replace(new RegExp(`omnibusDeponent${oldIndex}`), `omnibusDeponent${newIndex}`);
  });

  card.querySelectorAll("[data-workflow-key]").forEach((el) => {
    el.dataset.workflowKey = el.dataset.workflowKey.replace(
      new RegExp(`omnibusLocation${oldIndex}`), `omnibusLocation${newIndex}`
    );
  });
}

function updateOmnibusRemoveButtons() {
  const container = document.getElementById("omnibusCardsContainer");
  if (!container) return;
  const cards = container.querySelectorAll(".omnibus-card");
  const onlyOne = cards.length === 1;
  cards.forEach((card) => {
    const btn = card.querySelector(".omnibus-remove-btn");
    if (btn) btn.disabled = onlyOne;
  });
}

function updateOmnibusAddButtonState() {
  const addBtn = document.querySelector(".omnibus-add-btn");
  if (addBtn) addBtn.disabled = _omnibusDeponentCount >= 8;
}

function createOmnibusLocationWorkflow(index, toggleField, locationField) {
  const wrapper = document.createElement("section");
  wrapper.className = "field-workflow";
  wrapper.dataset.workflowKey = `omnibusLocation${index}`;

  const checklist = document.createElement("div");
  checklist.className = "field-workflow-checklist checkbox-grid";
  checklist.appendChild(createChecklistOption(toggleField));
  wrapper.appendChild(checklist);

  const actions = document.createElement("div");
  actions.className = "field-workflow-actions";

  const doneButton = document.createElement("button");
  doneButton.type = "button";
  doneButton.className = "action-secondary action-sm";
  doneButton.textContent = "Done";
  actions.appendChild(doneButton);
  wrapper.appendChild(actions);

  const details = document.createElement("div");
  details.className = "field-workflow-details";
  details.hidden = !Boolean(loadDraftUi()[`omnibusLocation${index}`]);
  wrapper.appendChild(details);

  const renderDetails = () => {
    details.innerHTML = "";
    const toggle = questionnaireRoot.querySelector(`[name="${toggleField.id}"]`);

    if (!toggle?.checked) {
      details.hidden = true;
      setDraftUiValue(`omnibusLocation${index}`, false);
      saveDraft();
      return;
    }

    details.hidden = false;
    details.appendChild(createField(locationField));
    bindConditionalFields();
    applyDraftToIntake();
    setDraftUiValue(`omnibusLocation${index}`, true);
    saveDraft();
  };

  doneButton.addEventListener("click", renderDetails);

  if (!details.hidden) {
    renderDetails();
  }

  return wrapper;
}

function collectIntake() {
  const intake = {};
  const fields = questionnaireRoot.querySelectorAll("input, textarea, select");

  Array.from(fields).forEach((field) => {
    if (!field.name) {
      return;
    }

    if (field.dataset.timePart === "clock") {
      const wrapper = field.closest(".field");
      const meridiem = wrapper?.querySelector('select[data-time-part="meridiem"]');
      const timezone = wrapper?.querySelector('select[data-time-part="timezone"]');
      intake[field.name] = composeStoredTimeValue(field.value, meridiem?.value, timezone?.value);
      return;
    }

    if (field.type === "checkbox") {
      intake[field.name] = field.checked;
      return;
    }

    intake[field.name] = field.value;
  });

  Array.from(questionnaireRoot.querySelectorAll(".checkbox-group")).forEach((group) => {
    const fieldId = group.dataset.fieldId;
    intake[fieldId] = Array.from(group.querySelectorAll('input[type="checkbox"]:checked')).map(
      (node) => node.value,
    );
  });

  return intake;
}

function collectSelectedTemplates() {
  return Array.from(
    templateSelectionRoot.querySelectorAll('input[name="selectedTemplateIds"]:checked'),
  ).map((node) => node.value);
}

function renderGenerationResults(payload) {
  resultsNode.innerHTML = "";

  if (!payload.ok) {
    resultsNode.className = "results error";
    const list = document.createElement("ul");
    const issues = asArray(payload.issues);

    if (issues.length === 0) {
      const item = document.createElement("li");
      item.textContent = payload.error || "Generation failed.";
      list.appendChild(item);
    }

    issues.forEach((issue) => {
      const item = document.createElement("li");
      item.textContent = issue;
      list.appendChild(item);
    });
    resultsNode.appendChild(list);
    stepGenerate?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  resultsNode.className = "results success";
  const folderEl = document.createElement("p");
  if (payload.folder?.url) {
    folderEl.innerHTML = `Folder: <a href="${payload.folder.url}" target="_blank" rel="noreferrer">${payload.folder.name}</a>`;
  } else {
    folderEl.textContent = `Generated: ${payload.folder?.name || "Documents ready"}`;
  }
  resultsNode.appendChild(folderEl);

  const list = document.createElement("ul");
  asArray(payload.documents).forEach((documentItem) => {
    const item = document.createElement("li");
    const isDownload = documentItem.url?.startsWith("/api/download/");
    if (isDownload) {
      item.innerHTML = `<a href="${documentItem.url}" download="${documentItem.name}">${documentItem.name}</a>`;
    } else {
      item.innerHTML = `<a href="${documentItem.url}" target="_blank" rel="noreferrer">${documentItem.name}</a>`;
    }
    list.appendChild(item);
  });
  resultsNode.appendChild(list);
}

function renderTemplateValidationResults(payload) {
  resultsNode.innerHTML = "";

  if (!payload.ok && asArray(payload.issues).length > 0) {
    renderGenerationResults(payload);
    return;
  }

  const invalidTemplates = asArray(payload.templates).filter((item) => !item.ok);
  resultsNode.className = invalidTemplates.length === 0 ? "results success" : "results info";

  const summary = document.createElement("p");
  summary.textContent =
    invalidTemplates.length === 0
      ? `All ${payload.summary?.checked || 0} selected template IDs resolve to native Google Docs.`
      : `${payload.summary?.invalid || invalidTemplates.length} of ${payload.summary?.checked || 0} selected template IDs need attention.`;
  resultsNode.appendChild(summary);

  const list = document.createElement("ul");
  asArray(payload.templates).forEach((item) => {
    const entry = document.createElement("li");
    const base = `${item.title}: `;

    if (!item.ok) {
      entry.textContent = `${base}${item.error || "Validation failed."}`;
      list.appendChild(entry);
      return;
    }

    const statusLabel = item.isNativeGoogleDoc ? "native Google Doc" : `not a native Google Doc (${item.mimeType})`;
    const fileLabel = item.fileName ? `${item.fileName}` : item.fileId;
    entry.textContent = `${base}${statusLabel}. File: ${fileLabel}. ID: ${item.fileId}`;
    list.appendChild(entry);
  });
  resultsNode.appendChild(list);
}

function renderExtractionResults(payload) {
  if (!extractionSummaryNode) return;

  if (!payload?.ok) {
    extractionSummaryNode.hidden = true;
    if (applyAndGenerateButton) applyAndGenerateButton.disabled = true;
    if (applyAndReviewButton) applyAndReviewButton.disabled = true;
    return;
  }

  if (extractionSummaryList) {
    extractionSummaryList.innerHTML = "";
    asArray(payload.summary).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      extractionSummaryList.appendChild(li);
    });
  }

  if (extractionSummaryTitle) {
    const names = asArray(payload.documents).map((d) => d.name).join(", ");
    extractionSummaryTitle.textContent = names;
  }

  extractionSummaryNode.hidden = false;
  if (applyAndGenerateButton) applyAndGenerateButton.disabled = false;
  if (applyAndReviewButton) applyAndReviewButton.disabled = false;
  window.setTimeout(() => {
    extractionSummaryNode.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 50);
}

function applySuggestedValues() {
  if (!extractedPayload?.suggestions) {
    return;
  }

  Object.entries(asObject(extractedPayload.suggestions)).forEach(([key, value]) => {
    const checkboxNodes = questionnaireRoot.querySelectorAll(`input[type="checkbox"][name="${key}"]`);
    if (checkboxNodes.length > 1) {
      const rawValues = String(value)
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
      const selectedValues = new Set(
        rawValues.flatMap((item) => resolveCheckboxGroupValues(key, item, checkboxNodes)),
      );

      checkboxNodes.forEach((node) => {
        node.checked = selectedValues.has(node.value);
      });
      return;
    }

    const field = questionnaireRoot.querySelector(`[name="${key}"]`);
    if (field && field.type !== "checkbox") {
      field.value = value;
      return;
    }

    if (field && field.type === "checkbox") {
      field.checked = value === true || String(value).toLowerCase() === "true";
      return;
    }

    if (checkboxNodes.length === 1) {
      checkboxNodes[0].checked = value === true || String(value).toLowerCase() === "true";
    }
  });

  // Pre-fill omnibus deponent names from keyPersonsList (3–6 people, dates left blank)
  const rawKeyPersons = String(asObject(extractedPayload.suggestions).keyPersonsList || "");
  const keyPersonNames = rawKeyPersons.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (keyPersonNames.length > 0) {
    const deponentCount = Math.min(Math.max(keyPersonNames.length, 3), 8);
    // Create extra cards as needed.
    while (_omnibusDeponentCount < deponentCount) {
      omnibusCreateCard();
    }
    updateOmnibusRemoveButtons();
    bindConditionalFields();
    for (let i = 1; i <= deponentCount; i += 1) {
      const nameField = questionnaireRoot.querySelector(`[name="omnibusDeponent${i}Name"]`);
      if (nameField && keyPersonNames[i - 1]) nameField.value = keyPersonNames[i - 1];
    }
  }

  updateConditionalFields();
  updateOmnibusLocationVisibility();
  syncProtectiveOrderDefaults();
}

function clearAllFields() {
  // Reset omnibus to 1 card before clearing to avoid dangling field refs.
  const omnibusContainer = document.getElementById("omnibusCardsContainer");
  if (omnibusContainer) {
    while (omnibusContainer.children.length > 1) {
      omnibusContainer.lastChild.remove();
    }
    _omnibusDeponentCount = 1;
    const firstCard = omnibusContainer.querySelector(".omnibus-card");
    if (firstCard) {
      firstCard.dataset.deponentIndex = "1";
      const t = firstCard.querySelector(".omnibus-card-title");
      if (t) t.textContent = "Deponent 1";
    }
    const countInput = questionnaireRoot.querySelector('[name="omnibusDeponentCount"]');
    if (countInput) countInput.value = "1";
    updateOmnibusRemoveButtons();
    updateOmnibusAddButtonState();
  }

  questionnaireRoot.querySelectorAll("input, textarea, select").forEach((field) => {
    if (field.type === "checkbox") {
      field.checked = false;
    } else if (field.tagName === "SELECT") {
      field.selectedIndex = 0;
    } else {
      field.value = "";
    }
  });
  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  extractedPayload = null;
  if (extractionSummaryNode) extractionSummaryNode.hidden = true;
  setExtractionStatus("");
  updateConditionalFields();
  updateOmnibusLocationVisibility();
}

function resolveCheckboxGroupValues(fieldName, rawValue, checkboxNodes) {
  const normalizedValue = rawValue.trim().toLowerCase();
  const directMatch = Array.from(checkboxNodes).find((node) => node.value.toLowerCase() === normalizedValue);
  if (directMatch) {
    return [directMatch.value];
  }

  const optionLabels = Array.from(checkboxNodes).map((node) => {
    const labelText = node.closest("label")?.querySelector("strong")?.textContent?.trim() || "";
    return { value: node.value, label: labelText.toLowerCase() };
  });

  const labelMatch = optionLabels.find((option) => option.label === normalizedValue);
  if (labelMatch) {
    return [labelMatch.value];
  }

  if (fieldName === "claimsAndCounts") {
    const claimAliases = {
      "race discrimination": "race",
      race: "race",
      "color discrimination": "color",
      color: "color",
      "age discrimination": "age",
      age: "age",
      "sex discrimination": "sex",
      sex: "sex",
      "disability discrimination": "disability",
      disability: "disability",
      "associational discrimination": "associational",
      associational: "associational",
      retaliation: "retaliation",
      "workers' compensation retaliation": "workers_comp",
      "workers compensation retaliation": "workers_comp",
      whistleblower: "whistleblower",
      "whistleblower retaliation": "whistleblower",
      "rsmo 105.555": "rsmo_105_055",
      "rsmo 105.055": "rsmo_105_055",
    };

    const aliasValue = claimAliases[normalizedValue];
    if (aliasValue) {
      return [aliasValue];
    }
  }

  if (fieldName === "adverseActions") {
    const adverseActionAliases = {
      discipline: "discipline",
      "performance improvement plan": "pip",
      pip: "pip",
      "schedule reduction": "schedule_reduction",
      termination: "termination",
      "denial of accommodation": "denial_of_accommodation",
    };

    const aliasValue = adverseActionAliases[normalizedValue];
    if (aliasValue) {
      return [aliasValue];
    }
  }

  return [];
}

const PO_SYNC_FIELDS = new Set(["caseNumber", "plaintiffName", "collectiveDefendantShortName", "defendantReferenceName", "defendantName"]);

function bindConditionalFields() {
  questionnaireRoot.querySelectorAll("input, select, textarea").forEach((field) => {
    field.addEventListener("change", updateConditionalFields);
    field.addEventListener("input", updateConditionalFields);

    if (field.name) {
      field.addEventListener("change", saveDraft);
      field.addEventListener("input", saveDraft);
    }

    if (PO_SYNC_FIELDS.has(field.name)) {
      field.addEventListener("input", syncProtectiveOrderDefaults);
      field.addEventListener("change", syncProtectiveOrderDefaults);
    }
  });

  questionnaireRoot.querySelectorAll('input[type="checkbox"][name^="omnibusDeponent"][name$="InPerson"]').forEach((field) => {
    field.addEventListener("change", updateOmnibusLocationVisibility);
    field.addEventListener("input", updateOmnibusLocationVisibility);
  });
}

function getCurrentFieldValue(fieldName) {
  const nodes = questionnaireRoot.querySelectorAll(`[name="${fieldName}"]`);
  if (nodes.length === 0) {
    return "";
  }

  const firstNode = nodes[0];
  if (firstNode.type === "checkbox") {
    if (nodes.length === 1) {
      return firstNode.checked;
    }

    return Array.from(nodes)
      .filter((node) => node.checked)
      .map((node) => node.value);
  }

  return firstNode.value;
}

function evaluateCondition(condition) {
  const currentValue = getCurrentFieldValue(condition.field);

  if (condition.op === "gte") {
    return Number(currentValue || 0) >= Number(condition.value);
  }

  if (condition.op === "eq") {
    return currentValue === condition.value;
  }

  if (condition.op === "includes") {
    if (Array.isArray(currentValue)) {
      return currentValue.includes(condition.value);
    }

    return String(currentValue || "")
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .includes(condition.value);
  }

  return Boolean(currentValue);
}

function updateConditionalFields() {
  questionnaireRoot.querySelectorAll("[data-show-if]").forEach((node) => {
    const workflowDetails = node.closest(".field-workflow-details");
    if (workflowDetails && (workflowDetails.hidden || workflowDetails.childElementCount === 0)) {
      node.hidden = true;
      node.querySelectorAll("input, select, textarea").forEach((field) => {
        field.disabled = true;
      });
      return;
    }

    const condition = JSON.parse(node.dataset.showIf);
    const visible = evaluateCondition(condition);
    node.hidden = !visible;
    node.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = !visible;
    });
  });
}

function updateOmnibusLocationVisibility() {
  const container = document.getElementById("omnibusCardsContainer");
  if (!container) return;
  Array.from(container.querySelectorAll(".omnibus-card")).forEach((card) => {
    const index = card.dataset.deponentIndex;
    if (!index) return;
    const inPersonField = card.querySelector(`[name="omnibusDeponent${index}InPerson"]`);
    const locationField = card.querySelector(`[name="omnibusDeponent${index}Location"]`);
    if (!inPersonField || !locationField) return;
    const locationWrapper = locationField.closest(".field");
    const shouldShowLocation = inPersonField.checked;
    if (locationWrapper) locationWrapper.hidden = !shouldShowLocation;
    locationField.disabled = !shouldShowLocation;
    if (!shouldShowLocation) locationField.value = "";
  });
}

async function readFileAsBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

async function extractFromFiles() {
  if (!sourceFilesInput) {
    throw new Error("Source extraction is not available in this build.");
  }

  const files = Array.from(sourceFilesInput.files || []);

  if (files.length === 0) {
    throw new Error("Choose at least one source document.");
  }

  if (files.length > 5) {
    throw new Error("Upload no more than five files.");
  }

  const serializedFiles = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      contentType: file.type,
      contentBase64: await readFileAsBase64(file),
    })),
  );

  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: serializedFiles }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Extraction failed.");
  }

  extractedPayload = payload;
  renderExtractionResults(payload);
}

async function loadAuthSession() {
  const response = await fetch("/api/auth/session", {
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("Failed to load Google auth session.");
  }

  authSession = await response.json();
  updateAuthUi();
}

async function loadData() {
  const [questionnaireResponse, templatesResponse] = await Promise.all([
    fetch("/api/questionnaire"),
    fetch("/api/templates"),
  ]);

  if (!questionnaireResponse.ok || !templatesResponse.ok) {
    throw new Error("Failed to load questionnaire or template registry.");
  }

  questionnaire = await questionnaireResponse.json();
  templates = asArray((await templatesResponse.json()).documents);
  renderTemplateSelection();
  // Patch attorney options now if already fetched, otherwise patchAttorneyOptions will re-render.
  if (_orgAttorneys.length) patchAttorneyOptions(_orgAttorneys);
  else renderQuestionnaire();
  await loadAuthSession();
}

// ── Wizard step management ──

function showStepDetails() {
  if (stepDetails) {
    stepDetails.hidden = false;
    window.setTimeout(() => {
      stepDetails.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }
}

function scrollToGenerate() {
  if (stepGenerate) {
    window.setTimeout(() => {
      stepGenerate.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }
}

// ── Upload zone file feedback ──

if (sourceFilesInput && uploadZoneLabel) {
  sourceFilesInput.addEventListener("change", () => {
    const files = Array.from(sourceFilesInput.files || []);
    if (files.length === 0) {
      uploadZoneLabel.textContent = "Drop a PDF here, or click to browse";
    } else if (files.length === 1) {
      uploadZoneLabel.textContent = files[0].name;
    } else {
      uploadZoneLabel.textContent = `${files.length} files selected`;
    }
  });
}

// ── Extract button ──

if (extractButton) {
  extractButton.addEventListener("click", async () => {
    try {
      setExtractionStatus("Extracting case information from your document…", "busy");
      extractionSummaryNode.hidden = true;
      extractionStatusNode?.scrollIntoView({ behavior: "smooth", block: "center" });
      const filesToUpload = Array.from(sourceFilesInput?.files || []);
      await extractFromFiles();
      setExtractionStatus("");
      ensureCase().then(() => {
        logEvent("extraction_complete", { fileCount: filesToUpload.length });
        uploadPetitionFiles(filesToUpload);
      });
    } catch (error) {
      extractedPayload = null;
      renderExtractionResults(null);
      setExtractionStatus(error.message, "error");
    }
  });
}

// ── Wizard action buttons ──

if (applyAndGenerateButton) {
  applyAndGenerateButton.addEventListener("click", () => {
    applySuggestedValues();
    saveDraft();
    if (stepDetails) stepDetails.hidden = false;
    window.setTimeout(() => {
      const firstSection = document.querySelector(`#qs-${GUIDED_FLOW_SECTIONS[0]}`);
      (firstSection || stepDetails)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  });
}

if (applyAndReviewButton) {
  applyAndReviewButton.addEventListener("click", () => {
    applySuggestedValues();
    showStepDetails();
  });
}

if (skipToManualButton) {
  skipToManualButton.addEventListener("click", () => {
    showStepDetails();
    ensureCase();
  });
}

if (continueToGenerateButton) {
  continueToGenerateButton.addEventListener("click", () => {
    saveDraft();
    scrollToGenerate();
  });
}

// ── Auth buttons ──

if (googleLoginButton) {
  googleLoginButton.addEventListener("click", () => {
    saveDraft();
    window.location.href = "/auth/google";
  });
}

async function signOutGoogle() {
  const response = await fetch("/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    setStatus("Unable to sign out of Google session.", "error");
    return;
  }

  authSession = { configured: true, signedIn: false, user: null };
  updateAuthUi();
  setStatus("Signed out.", "success");
}

if (googleLogoutButton) {
  googleLogoutButton.addEventListener("click", signOutGoogle);
}

if (clearAllButton) {
  clearAllButton.addEventListener("click", () => {
    if (confirmModal) confirmModal.hidden = false;
  });
}

if (confirmModalCancel) {
  confirmModalCancel.addEventListener("click", () => {
    if (confirmModal) confirmModal.hidden = true;
  });
}

if (confirmModalConfirm) {
  confirmModalConfirm.addEventListener("click", () => {
    if (confirmModal) confirmModal.hidden = true;
    clearAllFields();
  });
}

// Close modal on backdrop click
if (confirmModal) {
  confirmModal.addEventListener("click", (e) => {
    if (e.target === confirmModal) confirmModal.hidden = true;
  });
}

// ── Generate ──

async function handleGenerateClick() {
  try {
    if (!_emailOnlyMode && !authSession?.signedIn) {
      setStatus("Sign in with Google before generating documents.", "error");
      return;
    }

    if (collectSelectedTemplates().length === 0) {
      setStatus("Select at least one filing before generating documents.", "error");
      return;
    }

    setStatus(_emailOnlyMode ? `Generating ${_generateFormat.toUpperCase()} documents…` : FORMAT_LABELS[_generateFormat].status, "busy");
    resultsNode.innerHTML = "";
    resultsNode.className = "results";
    setGenerateButtonsDisabled(true);
    setTemplateValidationDisabled(true);
    startGenerationProgress();
    saveDraft();
    window.setTimeout(() => statusBanner?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intake: collectIntake(),
        selectedTemplateIds: collectSelectedTemplates(),
        attorneys: _orgAttorneys,
        format: _generateFormat,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      stopGenerationProgress(100);
      setStatus("Generation failed.", "error");
      renderGenerationResults(payload);
      return;
    }

    stopGenerationProgress(100);
    setStatus("Documents created successfully.", "success");
    renderGenerationResults(payload);
    window.setTimeout(() => resultsNode?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    markCaseGenerated(payload.folder?.url || null);
    logEvent("documents_generated", { folderUrl: payload.folder?.url, documentCount: payload.documents?.length });
  } catch (error) {
    stopGenerationProgress(100);
    setStatus(error.message, "error");
    resultsNode.innerHTML = `<ul><li>${error.message}</li></ul>`;
    resultsNode.className = "results error";
  } finally {
    setGenerateButtonsDisabled(!_emailOnlyMode && !authSession?.signedIn);
    setTemplateValidationDisabled(!_emailOnlyMode && !authSession?.signedIn);
  }
}

async function handleValidateTemplatesClick() {
  try {
    if (!authSession?.signedIn) {
      setStatus("Sign in with Google before validating template IDs.", "error");
      return;
    }

    if (collectSelectedTemplates().length === 0) {
      setStatus("Select at least one filing before validating template IDs.", "error");
      return;
    }

    setStatus("Checking selected template IDs in Google Drive…", "busy");
    resultsNode.innerHTML = "";
    resultsNode.className = "results";
    setGenerateButtonsDisabled(true);
    setTemplateValidationDisabled(true);
    saveDraft();

    const response = await fetch("/api/templates/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedTemplateIds: collectSelectedTemplates() }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setStatus("Template ID check failed.", "error");
      renderGenerationResults(payload);
      return;
    }

    renderTemplateValidationResults(payload);
    setStatus(
      payload.ok
        ? "Selected template IDs are ready for generation."
        : "Some selected template IDs are not native Google Docs.",
      payload.ok ? "success" : "error",
    );
  } catch (error) {
    setStatus(error.message, "error");
    resultsNode.innerHTML = `<ul><li>${error.message}</li></ul>`;
    resultsNode.className = "results error";
  } finally {
    setGenerateButtonsDisabled(!_emailOnlyMode && !authSession?.signedIn);
    setTemplateValidationDisabled(!_emailOnlyMode && !authSession?.signedIn);
  }
}

// ── Format tabs ──

const FORMAT_LABELS = {
  docs: { button: "Generate to Google Drive", status: "Generating documents in Google Drive…" },
  pdf:  { button: "Generate as PDF",           status: "Generating PDF documents in Google Drive…" },
  word: { button: "Generate as Word Doc",      status: "Generating Word documents in Google Drive…" },
};

document.querySelectorAll(".format-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".format-tab").forEach((t) => {
      t.classList.remove("is-active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("is-active");
    tab.setAttribute("aria-selected", "true");
    _generateFormat = tab.dataset.format || "docs";
    generateButtons.forEach((btn) => { btn.textContent = FORMAT_LABELS[_generateFormat].button; });
  });
});

generateButtons.forEach((button) => {
  button.addEventListener("click", handleGenerateClick);
});

if (validateTemplatesButton) {
  validateTemplatesButton.addEventListener("click", handleValidateTemplatesClick);
}

templateSelectionRoot.addEventListener("change", saveDraft);

loadData()
  .then(() => {
    const authError = new URLSearchParams(window.location.search).get("authError");
    if (authError) {
      setStatus(`Google sign-in failed: ${authError}`, "error");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (_emailOnlyMode || authSession?.signedIn) {
      setStatus("Ready to generate.", "success");
      return;
    }

    if (authSession?.configured) {
      setStatus("Sign in with Google, then generate.", "idle");
      return;
    }

    setStatus(authSession?.error || "Google OAuth is not configured.", "error");
  })
  .catch((error) => setStatus(error.message, "error"));

// ── Main-page user bubble ──

function renderMainUserBubble(sb, session, profile) {
  const bubble = document.getElementById("userBubble");
  if (!bubble) return;

  const displayName = profile?.full_name || session.user?.user_metadata?.full_name || session.user?.email || "Account";
  const initials = displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const isAdmin = profile?.role === "admin";

  document.getElementById("userBubbleAvatar").textContent = initials;
  document.getElementById("userBubbleName").textContent = displayName;
  if (!isAdmin) document.getElementById("userBubbleSettingsLink")?.remove();

  bubble.hidden = false;

  const trigger = document.getElementById("userBubbleTrigger");
  const dropdown = document.getElementById("userBubbleDropdown");

  trigger.addEventListener("click", () => {
    const open = !dropdown.hidden;
    dropdown.hidden = open;
    trigger.setAttribute("aria-expanded", String(!open));
  });

  document.addEventListener("click", (e) => {
    if (!bubble.contains(e.target)) {
      dropdown.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  }, { capture: true });

  document.getElementById("userBubbleSignOut")?.addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.href = "/login";
  });
}

function applyEmailOnlyMode() {
  _emailOnlyMode = true;

  // Hide Google Docs tab and auto-select PDF.
  document.querySelectorAll(".format-tab").forEach((tab) => {
    if (tab.dataset.format === "docs") {
      tab.hidden = true;
    }
    if (tab.dataset.format === "pdf") {
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
    } else {
      tab.classList.remove("is-active");
      tab.setAttribute("aria-selected", "false");
    }
  });
  _generateFormat = "pdf";
  generateButtons.forEach((btn) => { btn.textContent = FORMAT_LABELS.pdf.button; });

  // Hide the Drive auth row entirely.
  const authRow = document.querySelector(".generate-auth-row");
  if (authRow) authRow.hidden = true;
  if (signInNotice) signInNotice.hidden = true;

  // Enable generate buttons — service account handles the Google API access.
  setGenerateButtonsDisabled(false);
  setStatus("Ready to generate.", "success");
}

async function autoConnectGoogleDrive(session) {
  const token = session.provider_token;
  if (!token) return;
  try {
    await fetch("/api/auth/google-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: token,
        refreshToken: session.provider_refresh_token || "",
        userEmail: session.user?.email || "",
        userName: session.user?.user_metadata?.full_name || session.user?.email || "",
      }),
    });
    // Reload session state so the Drive UI updates.
    await loadAuthSession();
  } catch {}
}

// Auth gate — redirect to /login if Supabase is configured and no session.
(async () => {
  const cfg = window.__FDF_CONFIG__;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) return;
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = "/login"; return; }

  // How-to modal (needs session to persist dismissed state).
  initHowTo({ supabase: sb, userId: session.user.id });
  document.getElementById("helpButton")?.addEventListener("click", openHowTo);

  // Case persistence + attorney options (reuses same client).
  await initCasePersistence(sb, session);

  // Populate the user bubble in the topbar.
  renderMainUserBubble(sb, session, _sbProfile);

  // Email/password users get service-account generation; Google OAuth users
  // auto-connect to Drive using the token Supabase already obtained.
  const provider = session.user?.app_metadata?.provider;
  if (provider && provider !== "google") {
    applyEmailOnlyMode();
  } else if (provider === "google") {
    await autoConnectGoogleDrive(session);
  }
})();

// Fallback: if Supabase not configured, still init how-to without persistence.
if (!window.__FDF_CONFIG__?.supabaseUrl) {
  initHowTo({});
  document.getElementById("helpButton")?.addEventListener("click", openHowTo);
}
