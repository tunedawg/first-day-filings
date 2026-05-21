"""
app.py
Flask application for the Deposition Prep Agent.
"""

import os
import json
import queue
import threading
import logging
from functools import wraps
from flask import Flask, request, jsonify, Response, session, redirect, render_template_string
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-me")
CORS(app, supports_credentials=True)

# In-memory job store (keyed by job_id)
JOBS: dict[str, queue.Queue] = {}


# ---------------------------------------------------------------------------
# Auth middleware (Supabase JWT)
# ---------------------------------------------------------------------------

def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        if not token:
            token = request.cookies.get("sb-access-token")
        if not token:
            return jsonify({"error": "Unauthorized"}), 401
        try:
            from supabase import create_client
            sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
            user = sb.auth.get_user(token)
            if not user:
                return jsonify({"error": "Invalid token"}), 401
            request.user = user
        except Exception as e:
            return jsonify({"error": f"Auth error: {e}"}), 401
        return f(*args, **kwargs)
    return wrapper


def require_admin(f):
    """Only allow the first/admin user (checks Supabase role or email allowlist)."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        # Simple: check env var ADMIN_EMAILS
        admin_emails = os.environ.get("ADMIN_EMAILS", "").split(",")
        try:
            email = request.user.user.email
            if email not in [e.strip() for e in admin_emails if e.strip()]:
                return jsonify({"error": "Admin only"}), 403
        except Exception:
            return jsonify({"error": "Admin only"}), 403
        return f(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.route("/health")
def health():
    return jsonify({"status": "ok"})


# ---------------------------------------------------------------------------
# Box OAuth (shared firm account — admin only)
# ---------------------------------------------------------------------------

@app.route("/oauth/box/connect")
@require_auth
@require_admin
def box_connect():
    import box_client
    url = box_client.get_auth_url(state="admin")
    return redirect(url)


@app.route("/oauth/box/callback")
def box_callback():
    code = request.args.get("code")
    if not code:
        return "Missing code", 400
    import box_client
    try:
        box_client.exchange_code(code)
        return redirect("/?box_connected=1")
    except Exception as e:
        return f"Box OAuth error: {e}", 500


@app.route("/api/box/status")
@require_auth
def box_status():
    import box_client
    try:
        box_client.get_access_token()
        return jsonify({"connected": True})
    except Exception:
        return jsonify({"connected": False})


# ---------------------------------------------------------------------------
# Google OAuth (shared firm account — admin only)
# ---------------------------------------------------------------------------

@app.route("/oauth/google/connect")
@require_auth
@require_admin
def google_connect():
    import google_docs_client as gdocs
    url = gdocs.get_auth_url(state="admin")
    return redirect(url)


@app.route("/oauth/google/callback")
def google_callback():
    code = request.args.get("code")
    if not code:
        return "Missing code", 400
    import google_docs_client as gdocs
    try:
        gdocs.exchange_code(code)
        return redirect("/?google_connected=1")
    except Exception as e:
        return f"Google OAuth error: {e}", 500


@app.route("/api/google/status")
@require_auth
def google_status():
    import google_docs_client as gdocs
    try:
        gdocs.get_access_token()
        return jsonify({"connected": True})
    except Exception:
        return jsonify({"connected": False})


# ---------------------------------------------------------------------------
# Agent endpoint
# ---------------------------------------------------------------------------

@app.route("/api/run", methods=["POST"])
@require_auth
def run_agent():
    import uuid
    from agent import run_agent as _run_agent

    data = request.json
    required = ["case_name", "witness_name", "defendant_abbrev",
                "search_terms", "petition_text", "plaintiff_last_name"]
    missing = [k for k in required if not data.get(k)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    job_id = str(uuid.uuid4())
    q = queue.Queue()
    JOBS[job_id] = q

    def run():
        try:
            gen = _run_agent(
                case_name=data["case_name"],
                witness_name=data["witness_name"],
                defendant_abbrev=data["defendant_abbrev"],
                search_terms=[t.strip() for t in data["search_terms"] if t.strip()],
                petition_text=data["petition_text"],
                plaintiff_last_name=data["plaintiff_last_name"],
            )
            for update in gen:
                q.put(update)
        except Exception as e:
            q.put({"status": "error", "message": str(e)})
        finally:
            q.put(None)  # sentinel

    t = threading.Thread(target=run, daemon=True)
    t.start()

    return jsonify({"job_id": job_id})


@app.route("/api/stream/<job_id>")
@require_auth
def stream(job_id: str):
    """SSE endpoint — client polls this for job updates."""
    q = JOBS.get(job_id)
    if not q:
        return jsonify({"error": "Unknown job"}), 404

    def generate():
        while True:
            update = q.get()
            if update is None:
                yield f"data: {json.dumps({'status': 'closed'})}\n\n"
                break
            yield f"data: {json.dumps(update)}\n\n"
            if update.get("status") in ("done", "error"):
                JOBS.pop(job_id, None)
                break

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------------------------------------------------------------------
# Main UI (single-page)
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template_string(HTML_UI)


HTML_UI = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Deposition Prep Agent</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: #f4f6f9; color: #1a1a2e; min-height: 100vh; }
  .header { background: #1a1a2e; color: white; padding: 16px 32px; display: flex; align-items: center; gap: 12px; }
  .header h1 { font-size: 1.2rem; font-weight: 600; }
  .status-dots { display: flex; gap: 8px; margin-left: auto; align-items: center; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #555; }
  .dot.connected { background: #4caf50; }
  .dot-label { font-size: 0.7rem; color: #aaa; }
  .container { max-width: 900px; margin: 32px auto; padding: 0 16px; }
  .card { background: white; border-radius: 8px; padding: 28px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); margin-bottom: 24px; }
  h2 { font-size: 1rem; font-weight: 600; margin-bottom: 18px; color: #1a1a2e; border-bottom: 2px solid #e8eaf0; padding-bottom: 10px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .form-group { display: flex; flex-direction: column; gap: 6px; }
  .form-group.full { grid-column: 1 / -1; }
  label { font-size: 0.8rem; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.04em; }
  input, textarea { border: 1px solid #d0d5e0; border-radius: 5px; padding: 9px 12px; font-size: 0.9rem; font-family: inherit; outline: none; transition: border 0.15s; }
  input:focus, textarea:focus { border-color: #1a1a2e; }
  textarea { resize: vertical; min-height: 100px; }
  .terms-input { display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; }
  .term-tag { background: #1a1a2e; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; display: flex; align-items: center; gap: 6px; }
  .term-tag button { background: none; border: none; color: white; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0; }
  #term-input { flex: 1; min-width: 160px; }
  .btn { padding: 10px 24px; border-radius: 5px; border: none; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: background 0.15s; }
  .btn-primary { background: #1a1a2e; color: white; }
  .btn-primary:hover { background: #2d2d4e; }
  .btn-primary:disabled { background: #999; cursor: not-allowed; }
  .log { background: #0f0f1a; color: #b0ffb0; border-radius: 6px; padding: 16px; font-family: 'Courier New', monospace; font-size: 0.8rem; max-height: 320px; overflow-y: auto; display: none; }
  .log.active { display: block; }
  .log-line { margin-bottom: 4px; }
  .log-line.error { color: #ff8080; }
  .log-line.done { color: #80ffff; font-weight: bold; }
  .result { background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 6px; padding: 16px; display: none; }
  .result.active { display: block; }
  .result a { color: #1a6e2e; font-weight: 600; }
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; margin-right: 6px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="header">
  <h1>⚖ Deposition Prep Agent</h1>
  <div class="status-dots">
    <span class="dot-label">Box</span><span class="dot" id="box-dot"></span>
    <span class="dot-label" style="margin-left:8px">Google</span><span class="dot" id="google-dot"></span>
  </div>
</div>

<div class="container">
  <div class="card">
    <h2>Case Information</h2>
    <div class="form-grid">
      <div class="form-group">
        <label>Case Name (Box folder name)</label>
        <input type="text" id="case_name" placeholder="e.g. Hayes v. Mosaic">
      </div>
      <div class="form-group">
        <label>Plaintiff Last Name</label>
        <input type="text" id="plaintiff_last_name" placeholder="e.g. Hayes">
      </div>
      <div class="form-group">
        <label>Defendant Abbreviation</label>
        <input type="text" id="defendant_abbrev" placeholder="e.g. Mosaic">
      </div>
      <div class="form-group">
        <label>Witness Full Name</label>
        <input type="text" id="witness_name" placeholder="e.g. Jason Zoubek">
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Search Terms</h2>
    <div class="form-group">
      <label>Add terms (press Enter after each)</label>
      <div class="terms-input" id="terms-container">
        <input type="text" id="term-input" placeholder="Type a term and press Enter…">
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Petition / Charge</h2>
    <div class="form-group">
      <label>Paste full text of Petition or EEOC Charge</label>
      <textarea id="petition_text" rows="10" placeholder="Paste petition or charge text here…"></textarea>
    </div>
  </div>

  <div style="margin-bottom:16px">
    <button class="btn btn-primary" id="run-btn" onclick="runAgent()">Run Agent</button>
  </div>

  <div class="log" id="log"></div>
  <div class="result" id="result"></div>
</div>

<script>
const terms = [];

document.getElementById('term-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = e.target.value.trim();
    if (val && !terms.includes(val)) {
      terms.push(val);
      renderTerms();
    }
    e.target.value = '';
  }
});

function removeTerm(t) {
  const i = terms.indexOf(t);
  if (i > -1) terms.splice(i, 1);
  renderTerms();
}

function renderTerms() {
  const container = document.getElementById('terms-container');
  const input = document.getElementById('term-input');
  container.innerHTML = '';
  terms.forEach(t => {
    const tag = document.createElement('span');
    tag.className = 'term-tag';
    tag.innerHTML = `${t} <button onclick="removeTerm('${t}')">×</button>`;
    container.appendChild(tag);
  });
  container.appendChild(input);
}

function getToken() {
  // Read Supabase token from localStorage (set by Supabase JS client)
  const keys = Object.keys(localStorage).filter(k => k.includes('auth-token') || k.includes('supabase'));
  for (const k of keys) {
    try {
      const val = JSON.parse(localStorage.getItem(k));
      if (val?.access_token) return val.access_token;
    } catch {}
  }
  return null;
}

function authHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function checkConnections() {
  const [box, google] = await Promise.all([
    fetch('/api/box/status', { headers: authHeaders() }).then(r => r.json()).catch(() => ({ connected: false })),
    fetch('/api/google/status', { headers: authHeaders() }).then(r => r.json()).catch(() => ({ connected: false })),
  ]);
  document.getElementById('box-dot').className = 'dot ' + (box.connected ? 'connected' : '');
  document.getElementById('google-dot').className = 'dot ' + (google.connected ? 'connected' : '');
}

function log(msg, type = '') {
  const el = document.getElementById('log');
  el.classList.add('active');
  const line = document.createElement('div');
  line.className = 'log-line ' + type;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

async function runAgent() {
  const btn = document.getElementById('run-btn');
  const result = document.getElementById('result');
  result.classList.remove('active');
  document.getElementById('log').innerHTML = '';

  const payload = {
    case_name: document.getElementById('case_name').value.trim(),
    plaintiff_last_name: document.getElementById('plaintiff_last_name').value.trim(),
    defendant_abbrev: document.getElementById('defendant_abbrev').value.trim(),
    witness_name: document.getElementById('witness_name').value.trim(),
    search_terms: terms,
    petition_text: document.getElementById('petition_text').value.trim(),
  };

  const missing = Object.entries(payload)
    .filter(([k, v]) => !v || (Array.isArray(v) && v.length === 0))
    .map(([k]) => k);
  if (missing.length) {
    alert('Please fill in: ' + missing.join(', '));
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Running…';

  try {
    const r = await fetch('/api/run', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const { job_id, error } = await r.json();
    if (error) throw new Error(error);

    // SSE stream
    const evtSource = new EventSource(`/api/stream/${job_id}`);
    evtSource.onmessage = e => {
      const data = JSON.parse(e.data);
      if (data.status === 'progress') {
        log(data.message);
      } else if (data.status === 'done') {
        log(data.message, 'done');
        result.classList.add('active');
        result.innerHTML = `
          <strong>✓ Done!</strong><br>
          <a href="${data.url}" target="_blank">Open Google Doc →</a><br>
          <a href="${data.box_planning_folder}" target="_blank" style="font-size:0.85rem;color:#555">View Planning Folder in Box →</a>
        `;
        btn.disabled = false;
        btn.innerHTML = 'Run Agent';
        evtSource.close();
      } else if (data.status === 'error') {
        log(data.message, 'error');
        btn.disabled = false;
        btn.innerHTML = 'Run Agent';
        evtSource.close();
      } else if (data.status === 'closed') {
        evtSource.close();
      }
    };
    evtSource.onerror = () => {
      log('Connection lost.', 'error');
      btn.disabled = false;
      btn.innerHTML = 'Run Agent';
    };
  } catch (err) {
    log(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Run Agent';
  }
}

checkConnections();
setInterval(checkConnections, 30000);
</script>
</body>
</html>
"""

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
