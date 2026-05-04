// How-to modal — shows on first visit, toggled by the "?" nav button.
// Call init() once per page. Pass supabase + userId to persist dismissed state.

const STORAGE_KEY = "fdf:how-to-dismissed";

let _supabase = null;
let _userId = null;

export function init({ supabase, userId } = {}) {
  _supabase = supabase || null;
  _userId = userId || null;

  injectModal(); // injects DOM + binds close/gotIt buttons internally

  document.getElementById("howToBackdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) dismiss();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("howToBackdrop").hidden) dismiss();
  });

  // "?" button in nav dispatches this event.
  document.addEventListener("fdf:openHelp", open);

  checkAndShow();
}

export function open() {
  const el = document.getElementById("howToBackdrop");
  if (el) el.hidden = false;
}

function dismiss() {
  const el = document.getElementById("howToBackdrop");
  if (el) el.hidden = true;
  localStorage.setItem(STORAGE_KEY, "1");
  if (_supabase && _userId) {
    _supabase
      .from("profiles")
      .update({ user_preferences: { howToDismissed: true } })
      .eq("id", _userId)
      .then(() => {});
  }
}

async function checkAndShow() {
  if (localStorage.getItem(STORAGE_KEY)) return;

  if (_supabase && _userId) {
    const { data } = await _supabase
      .from("profiles")
      .select("user_preferences")
      .eq("id", _userId)
      .maybeSingle();
    if (data?.user_preferences?.howToDismissed) {
      localStorage.setItem(STORAGE_KEY, "1");
      return;
    }
  }

  open();
}

function injectModal() {
  if (document.getElementById("howToBackdrop")) return;

  const el = document.createElement("div");
  el.id = "howToBackdrop";
  el.className = "how-to-backdrop";
  el.hidden = true;
  el.setAttribute("aria-modal", "true");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-labelledby", "howToTitle");

  el.innerHTML = `
    <div class="how-to-modal">
      <div class="how-to-header">
        <h2 id="howToTitle" class="how-to-title">How First Day Filings works</h2>
        <button id="howToCloseBtn" class="how-to-close" aria-label="Close">&times;</button>
      </div>

      <div class="how-to-steps">
        <div class="how-to-step">
          <div class="how-to-step-num">1</div>
          <div class="how-to-step-body">
            <h3>Upload the petition</h3>
            <p>Drop in a PDF or DOCX of the employment petition. AI reads it and extracts names, dates, case numbers, and claims automatically.</p>
          </div>
        </div>

        <div class="how-to-step">
          <div class="how-to-step-num">2</div>
          <div class="how-to-step-body">
            <h3>Review &amp; edit details</h3>
            <p>Every extracted field is editable. Add anything the AI missed, adjust names, and pick which filings to generate.</p>
          </div>
        </div>

        <div class="how-to-step">
          <div class="how-to-step-num">3</div>
          <div class="how-to-step-body">
            <h3>Generate to Google Drive</h3>
            <p>Hit Generate and all selected first-day documents are copied from your firm's templates, filled in, and saved directly to a new Drive folder.</p>
          </div>
        </div>
      </div>

      <div class="how-to-tips">
        <p class="how-to-tips-title">Tips</p>
        <ul>
          <li>Your work is auto-saved as a draft — pick up where you left off any time.</li>
          <li>Open this guide any time with the <strong>?</strong> button in the top bar.</li>
        </ul>
      </div>

      <div class="how-to-footer">
        <button id="howToGotItBtn" class="action-primary" type="button">Got it</button>
      </div>
    </div>
  `;

  document.body.appendChild(el);

  document.getElementById("howToCloseBtn").addEventListener("click", dismiss);
  document.getElementById("howToGotItBtn").addEventListener("click", dismiss);
}
