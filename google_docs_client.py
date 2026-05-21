"""
google_docs_client.py
Creates native Google Docs via the Docs API.
Handles OAuth token storage/refresh in Supabase.
Output: fully formatted deposition outline Doc.
Font: Century Schoolbook 13pt throughout.
"""

import os
import json
import logging
from typing import Optional
import requests

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
DOCS_API = "https://docs.googleapis.com/v1/documents"
DRIVE_API = "https://www.googleapis.com/drive/v3"

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI")

SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
]


# ---------------------------------------------------------------------------
# Token storage
# ---------------------------------------------------------------------------

def _get_supabase():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def load_tokens() -> Optional[dict]:
    sb = _get_supabase()
    res = sb.table("app_settings").select("value").eq("key", "google_tokens").execute()
    if res.data:
        return json.loads(res.data[0]["value"])
    return None


def save_tokens(tokens: dict):
    sb = _get_supabase()
    sb.table("app_settings").upsert(
        {"key": "google_tokens", "value": json.dumps(tokens)},
        on_conflict="key"
    ).execute()


def get_auth_url(state: str = "") -> str:
    from urllib.parse import urlencode
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    r = requests.post(GOOGLE_TOKEN_URL, data={
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    })
    r.raise_for_status()
    tokens = r.json()
    save_tokens(tokens)
    return tokens


def _refresh(refresh_token: str) -> dict:
    r = requests.post(GOOGLE_TOKEN_URL, data={
        "refresh_token": refresh_token,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "refresh_token",
    })
    r.raise_for_status()
    tokens = r.json()
    # Refresh response doesn't always include a new refresh_token
    if "refresh_token" not in tokens:
        tokens["refresh_token"] = refresh_token
    save_tokens(tokens)
    return tokens


def get_access_token() -> str:
    tokens = load_tokens()
    if not tokens:
        raise RuntimeError("Google not connected. Admin must authorize Google via /oauth/google/connect.")
    # Test token
    r = requests.get(f"{DRIVE_API}/about?fields=user",
                     headers={"Authorization": f"Bearer {tokens['access_token']}"})
    if r.status_code == 401:
        tokens = _refresh(tokens["refresh_token"])
    return tokens["access_token"]


def _headers() -> dict:
    return {"Authorization": f"Bearer {get_access_token()}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Doc creation
# ---------------------------------------------------------------------------

def create_deposition_outline(
    title: str,
    case_caption: dict,          # {plaintiff, defendant, court, case_no, division}
    what_we_want: list[str],
    overview: str,
    prefatory_rows: list[str],   # each is a paragraph of prefatory text
    rules_of_road: list[dict],   # [{heading, questions}]
    main_sections: list[dict],   # [{heading, content, documents}]
                                 # documents = [{date, ex_num, description, box_url, analysis, page_refs}]
    target_folder_id: str,       # Google Drive folder ID to place the doc in
) -> str:
    """
    Creates a native Google Doc and returns its URL.
    All text: Century Schoolbook 13pt.
    """

    # Step 1: Create blank doc
    r = requests.post(DOCS_API, headers=_headers(), json={"title": title})
    r.raise_for_status()
    doc = r.json()
    doc_id = doc["documentId"]

    # Step 2: Move to target Drive folder
    requests.patch(
        f"{DRIVE_API}/files/{doc_id}",
        headers={"Authorization": f"Bearer {get_access_token()}"},
        params={"addParents": target_folder_id, "removeParents": "root", "fields": "id,parents"},
    )

    # Step 3: Build batchUpdate requests
    requests_list = []
    # We insert content at the end of the doc.
    # Google Docs inserts at index 1 for a new doc.
    # We build a list of (text, style_fn) pairs and insert in reverse order
    # so indices stay valid — OR we can append sequentially using the doc's
    # end index. We'll use sequential append (simpler):

    segments = _build_segments(case_caption, what_we_want, overview,
                               prefatory_rows, rules_of_road, main_sections)

    # Insert all text first as one block, then apply styles
    full_text = ""
    for seg in segments:
        full_text += seg["text"]

    # Insert entire text body
    requests_list.append({
        "insertText": {
            "location": {"index": 1},
            "text": full_text
        }
    })

    # Now build style requests with correct indices
    idx = 1
    style_requests = []
    for seg in segments:
        end = idx + len(seg["text"])
        style_requests.extend(_style_requests(seg, idx, end))
        idx = end

    requests_list.extend(style_requests)

    # Step 4: Send batchUpdate in chunks of 500
    chunk_size = 500
    for i in range(0, len(requests_list), chunk_size):
        chunk = requests_list[i:i + chunk_size]
        r = requests.post(
            f"{DOCS_API}/{doc_id}:batchUpdate",
            headers=_headers(),
            json={"requests": chunk}
        )
        if not r.ok:
            logger.error(f"batchUpdate error: {r.text}")
            r.raise_for_status()

    return f"https://docs.google.com/document/d/{doc_id}/edit"


def _build_segments(case_caption, what_we_want, overview, prefatory_rows, rules_of_road, main_sections):
    """
    Returns list of segment dicts:
    {text, type} where type is one of:
    'title', 'heading1', 'heading2', 'body', 'bold_body',
    'table_cell', 'italic_body', 'link' (link also has 'url')
    """
    segs = []

    def add(text, type_, **kwargs):
        segs.append({"text": text, "type": type_, **kwargs})

    # -- Case caption (as text block, styled like a table header) --
    add(f"{case_caption['plaintiff'].upper()}, Plaintiff\n", "bold_body")
    add(f"v.\n", "body")
    add(f"{case_caption['defendant'].upper()}, Defendant.\n\n", "bold_body")
    add(f"{case_caption['court']}\n", "body")
    add(f"Case No. {case_caption['case_no']}\n\n", "body")

    # -- Doc title --
    add(f"DEPOSITION OUTLINE – {case_caption.get('witness', '').upper()}\n\n", "title")

    # -- What we want --
    add("What We Want Out of This Deposition\n", "heading1")
    for bullet in what_we_want:
        add(f"• {bullet}\n", "italic_body")
    add("\n", "body")

    # -- Overview --
    add("Overview\n", "heading1")
    add(f"{overview}\n\n", "body")

    # -- Prefatory Questions --
    add("PREFATORY QUESTIONS\n", "heading1")
    for row in prefatory_rows:
        add(f"{row}\n\n", "body")

    # -- Rules of the Road --
    if rules_of_road:
        add("Rules of the Road\n", "heading1")
        for section in rules_of_road:
            if section.get("heading"):
                add(f"{section['heading']}\n", "heading2")
            for q in section.get("questions", []):
                if isinstance(q, dict) and q.get("url"):
                    # Hyperlinked exhibit
                    add(f"{q['label']}\n", "link", url=q["url"])
                else:
                    add(f"{q}\n", "body")
            add("\n", "body")

    # -- Main sections --
    for section in main_sections:
        add(f"{section['heading']}\n", "heading1")
        if section.get("content"):
            add(f"{section['content']}\n\n", "body")

        for doc_entry in section.get("documents", []):
            # Date + exhibit line (bold, hyperlinked)
            label = ""
            if doc_entry.get("date"):
                label += f"{doc_entry['date']} – "
            if doc_entry.get("ex_num"):
                label += f"Ex. {doc_entry['ex_num']} – "
            label += doc_entry.get("description", "Document")

            if doc_entry.get("box_url"):
                add(f"{label}\n", "link", url=doc_entry["box_url"])
            else:
                add(f"{label}\n", "bold_body")

            # Claude analysis
            if doc_entry.get("analysis"):
                for line in doc_entry["analysis"]:
                    add(f"    • {line}\n", "body")

            # Page references
            for pr in doc_entry.get("page_refs", []):
                add(f"    – {pr}\n", "body")

            add("\n", "body")

    return segs


def _style_requests(seg: dict, start: int, end: int) -> list:
    """Generate Google Docs API style requests for a segment."""
    reqs = []
    text_range = {"startIndex": start, "endIndex": end}

    # Base: Century Schoolbook 13pt for everything
    base_style = {
        "updateTextStyle": {
            "range": text_range,
            "textStyle": {
                "weightedFontFamily": {"fontFamily": "Century Schoolbook"},
                "fontSize": {"magnitude": 13, "unit": "PT"},
            },
            "fields": "weightedFontFamily,fontSize",
        }
    }
    reqs.append(base_style)

    t = seg["type"]

    if t == "title":
        reqs.append({"updateParagraphStyle": {
            "range": text_range,
            "paragraphStyle": {"namedStyleType": "HEADING_1", "alignment": "CENTER"},
            "fields": "namedStyleType,alignment",
        }})
        reqs.append({"updateTextStyle": {
            "range": text_range,
            "textStyle": {"bold": True, "fontSize": {"magnitude": 14, "unit": "PT"}},
            "fields": "bold,fontSize",
        }})

    elif t == "heading1":
        reqs.append({"updateTextStyle": {
            "range": text_range,
            "textStyle": {"bold": True, "underline": True},
            "fields": "bold,underline",
        }})

    elif t == "heading2":
        reqs.append({"updateTextStyle": {
            "range": text_range,
            "textStyle": {"bold": True},
            "fields": "bold",
        }})

    elif t == "bold_body":
        reqs.append({"updateTextStyle": {
            "range": text_range,
            "textStyle": {"bold": True},
            "fields": "bold",
        }})

    elif t == "italic_body":
        reqs.append({"updateTextStyle": {
            "range": text_range,
            "textStyle": {"italic": True},
            "fields": "italic",
        }})

    elif t == "link":
        reqs.append({"updateTextStyle": {
            "range": text_range,
            "textStyle": {
                "bold": True,
                "foregroundColor": {"color": {"rgbColor": {"red": 0.1, "green": 0.1, "blue": 0.7}}},
                "link": {"url": seg["url"]},
            },
            "fields": "bold,foregroundColor,link",
        }})

    return reqs
