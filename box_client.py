"""
box_client.py
Handles all Box API interactions:
- OAuth flow (shared firm account)
- Token storage/refresh in Supabase
- Folder navigation (case folders, production subfolders, deposition subfolders)
- File search (filename + content)
- File copy to Planning folder
"""

import os
import json
import requests
from typing import Optional
import logging

logger = logging.getLogger(__name__)

BOX_AUTH_URL = "https://account.box.com/api/oauth2/authorize"
BOX_TOKEN_URL = "https://api.box.com/oauth2/token"
BOX_API_BASE = "https://api.box.com/2.0"

CLIENT_ID = os.environ.get("BOX_CLIENT_ID")
CLIENT_SECRET = os.environ.get("BOX_CLIENT_SECRET")
REDIRECT_URI = os.environ.get("BOX_REDIRECT_URI")


# ---------------------------------------------------------------------------
# Token storage (Supabase `app_settings` table, key = 'box_tokens')
# ---------------------------------------------------------------------------

def _get_supabase():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def load_tokens() -> Optional[dict]:
    sb = _get_supabase()
    res = sb.table("app_settings").select("value").eq("key", "box_tokens").execute()
    if res.data:
        return json.loads(res.data[0]["value"])
    return None


def save_tokens(tokens: dict):
    sb = _get_supabase()
    sb.table("app_settings").upsert(
        {"key": "box_tokens", "value": json.dumps(tokens)},
        on_conflict="key"
    ).execute()


def get_auth_url(state: str = "") -> str:
    params = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "state": state,
    }
    from urllib.parse import urlencode
    return f"{BOX_AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    r = requests.post(BOX_TOKEN_URL, data={
        "grant_type": "authorization_code",
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
    })
    r.raise_for_status()
    tokens = r.json()
    save_tokens(tokens)
    return tokens


def refresh_tokens(refresh_token: str) -> dict:
    r = requests.post(BOX_TOKEN_URL, data={
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    })
    r.raise_for_status()
    tokens = r.json()
    save_tokens(tokens)
    return tokens


def get_access_token() -> str:
    tokens = load_tokens()
    if not tokens:
        raise RuntimeError("Box not connected. Admin must authorize Box via /oauth/box/connect.")

    # Try current token; refresh if needed
    r = requests.get(f"{BOX_API_BASE}/users/me",
                     headers={"Authorization": f"Bearer {tokens['access_token']}"})
    if r.status_code == 401:
        tokens = refresh_tokens(tokens["refresh_token"])

    return tokens["access_token"]


# ---------------------------------------------------------------------------
# Box API helpers
# ---------------------------------------------------------------------------

def _headers() -> dict:
    return {"Authorization": f"Bearer {get_access_token()}"}


def _get(path: str, params: dict = None) -> dict:
    r = requests.get(f"{BOX_API_BASE}{path}", headers=_headers(), params=params or {})
    r.raise_for_status()
    return r.json()


def list_folder(folder_id: str) -> list:
    """Return all items in a folder (handles pagination)."""
    items = []
    offset = 0
    while True:
        data = _get(f"/folders/{folder_id}/items",
                    {"fields": "id,name,type", "limit": 1000, "offset": offset})
        items.extend(data["entries"])
        if offset + data["limit"] >= data["total_count"]:
            break
        offset += data["limit"]
    return items


def find_case_folder(case_name: str) -> Optional[dict]:
    """
    Search for case folder by name.
    Checks: root (folder 0) + 'Active Cases for Eve' subfolder.
    Returns folder dict {id, name} or None.
    """
    def search_in(folder_id: str) -> Optional[dict]:
        items = list_folder(folder_id)
        for item in items:
            if item["type"] == "folder" and case_name.lower() in item["name"].lower():
                return item
        return None

    # Check root
    result = search_in("0")
    if result:
        return result

    # Check 'Active Cases for Eve'
    root_items = list_folder("0")
    for item in root_items:
        if item["type"] == "folder" and "active cases for eve" in item["name"].lower():
            result = search_in(item["id"])
            if result:
                return result

    return None


def get_production_folders(case_folder_id: str) -> list:
    """Return all subfolders with 'production' in the name."""
    items = list_folder(case_folder_id)
    return [i for i in items if i["type"] == "folder" and "production" in i["name"].lower()]


def get_deposition_folders(case_folder_id: str) -> list:
    """Return all subfolders with 'deposition' in the name (for prior exhibit context)."""
    items = list_folder(case_folder_id)
    return [i for i in items if i["type"] == "folder" and "deposition" in i["name"].lower()]


def get_depositions_parent_folder(case_folder_id: str) -> Optional[dict]:
    """
    Find the existing Depositions folder inside the case folder.
    Returns folder dict or None.
    """
    items = list_folder(case_folder_id)
    for item in items:
        if item["type"] == "folder" and "deposition" in item["name"].lower():
            return item
    return None


def create_folder(name: str, parent_id: str) -> dict:
    r = requests.post(f"{BOX_API_BASE}/folders",
                      headers={**_headers(), "Content-Type": "application/json"},
                      json={"name": name, "parent": {"id": parent_id}})
    if r.status_code == 409:
        # Already exists — find it
        items = list_folder(parent_id)
        for item in items:
            if item["name"] == name and item["type"] == "folder":
                return item
        r.raise_for_status()
    r.raise_for_status()
    return r.json()


def copy_file(file_id: str, dest_folder_id: str, new_name: str = None) -> dict:
    payload = {"parent": {"id": dest_folder_id}}
    if new_name:
        payload["name"] = new_name
    r = requests.post(f"{BOX_API_BASE}/files/{file_id}/copy",
                      headers={**_headers(), "Content-Type": "application/json"},
                      json=payload)
    if r.status_code == 409:
        # Already exists — return existing
        items = list_folder(dest_folder_id)
        fname = new_name or _get(f"/files/{file_id}", {"fields": "name"})["name"]
        for item in items:
            if item["name"] == fname:
                return item
    r.raise_for_status()
    return r.json()


def get_file_download_url(file_id: str) -> str:
    r = requests.get(f"{BOX_API_BASE}/files/{file_id}/content",
                     headers=_headers(), allow_redirects=False)
    if r.status_code in (301, 302):
        return r.headers["Location"]
    r.raise_for_status()
    return r.url


def download_file(file_id: str) -> bytes:
    url = get_file_download_url(file_id)
    r = requests.get(url)
    r.raise_for_status()
    return r.content


def get_shared_link(file_id: str) -> str:
    """Create or retrieve a shared link for a file."""
    r = requests.put(
        f"{BOX_API_BASE}/files/{file_id}",
        headers={**_headers(), "Content-Type": "application/json"},
        json={"shared_link": {"access": "company"}}
    )
    r.raise_for_status()
    return r.json()["shared_link"]["url"]


def search_files_in_folder(folder_id: str, query: str) -> list:
    """
    Full-text search within a specific folder subtree.
    Returns list of file dicts.
    """
    r = requests.get(f"{BOX_API_BASE}/search", headers=_headers(), params={
        "query": query,
        "ancestor_folder_ids": folder_id,
        "type": "file",
        "fields": "id,name,parent",
        "limit": 200,
    })
    r.raise_for_status()
    return r.json().get("entries", [])


def list_all_files_in_folder(folder_id: str) -> list:
    """Recursively list all files under a folder."""
    results = []
    items = list_folder(folder_id)
    for item in items:
        if item["type"] == "file":
            results.append(item)
        elif item["type"] == "folder":
            results.extend(list_all_files_in_folder(item["id"]))
    return results
