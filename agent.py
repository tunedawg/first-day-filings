"""
agent.py
Core deposition prep pipeline. Called by the Flask route.
Yields status update strings (for SSE streaming to the UI).

Inputs:
- case_name: str
- witness_name: str
- defendant_abbrev: str
- search_terms: list[str]
- petition_text: str  (full text of Petition/Charge)

Pipeline:
1. Find case folder in Box
2. Get production subfolders (sources) + deposition subfolders (prior context)
3. Search production folders for responsive files (by search terms)
4. Read prior deposition folders for exhibit context
5. Copy responsive files to Planning folder
6. Download + extract text from all copied files
7. Call Claude API to analyze docs and generate outline sections
8. Create Google Doc via Docs API
9. Return Doc URL
"""

import logging
import re
import requests
from typing import Generator

logger = logging.getLogger(__name__)

PREFATORY_QUESTIONS = [
    "Do you understand that you have been placed under oath?\n"
    "What does this oath mean to you?\n"
    "It is always important to be honest, but most conversations in our society occur without an oath, don't they?\n"
    "Our judicial system depends heavily on absolute honesty by every witness, and the system breaks down if witnesses shade or distort the truth.\n"
    "Do you agree to be honest today and abide by your oath?",

    "Name (Full Legal)\nDate of Birth\nEmployed/Position\nHome Address\nBusiness address/email address/phone #\n"
    "Have you ever been arrested?\nHave you ever been found guilty or pled guilty, or no contest, to any criminal charge?\n"
    "Have you ever been a party to any case in court: sued someone, been sued by someone.",

    "Basics: Verbal responses. If you don't understand any of my questions, please ask for clarification. "
    "But if you don't ask for clarification, I'll assume that you have understood the question. "
    "If at any time you want to take a break, we can take a break, unless there's a question pending — "
    "in that case you need to answer the question first and then we'll get you a break. "
    "You understand as we take breaks that you will remain under oath during the course of this deposition, right?",

    "Are you under the influence of any substances or medications that might hinder your ability to recall facts "
    "or answer questions accurately today?\n"
    "Can you think of any other reason why you might not be able to answer questions accurately today?\n"
    "Is there any reason why your deposition should not go forward today?",

    "Where are you located right now? Anyone else in the room with you? Do you have any other windows open on "
    "your computer? Any documents in front of you? Any notes / notepad?",

    "Do you use social media, such as Facebook, Twitter, or Instagram? If so, what names/handles do you use?\n"
    "Have you ever complained about or commented about work or other employees on your social media?\n"
    "Do you use LinkedIn?",

    "What is your personal email address? If you have multiple, what are they?",

    "Are you represented by counsel here today? Who is your counsel? Meet to prepare? How long? How many times? "
    "Anyone else present? What documents did you review?",

    "Have you ever testified in any other cases?",

    "What's your highest level of education? Job duties, supervisor, supervisees, etc.",

    "What is your personal phone number? Work number — different or same? Does your employer provide you with a phone? "
    "Do you use it to make phone calls at work? Text coworkers? Tell me about all of them.\n"
    "When was your last communication with [key parties in this case]?",

    "Did you use an internal messaging system at work? Do you delete messages from these systems? "
    "Does it keep everything — for all time? How long does it keep things for then?",
]


def run_agent(
    case_name: str,
    witness_name: str,
    defendant_abbrev: str,
    search_terms: list,
    petition_text: str,
    plaintiff_last_name: str,
) -> Generator[dict, None, None]:
    """
    Generator that yields status dicts:
    {"status": "progress"|"done"|"error", "message": str, "url": str (on done)}
    """
    import box_client as box
    import file_reader
    import google_docs_client as gdocs
    import anthropic

    def progress(msg: str):
        logger.info(msg)
        yield {"status": "progress", "message": msg}

    try:
        # ------------------------------------------------------------------ #
        # 1. Find case folder
        # ------------------------------------------------------------------ #
        yield {"status": "progress", "message": f"Searching Box for case folder: {case_name}…"}
        case_folder = box.find_case_folder(case_name)
        if not case_folder:
            yield {"status": "error", "message": f"Could not find a Box folder matching '{case_name}'."}
            return
        yield {"status": "progress", "message": f"Found case folder: {case_folder['name']} (ID: {case_folder['id']})"}

        # ------------------------------------------------------------------ #
        # 2. Get production + deposition subfolders
        # ------------------------------------------------------------------ #
        production_folders = box.get_production_folders(case_folder["id"])
        deposition_folders = box.get_deposition_folders(case_folder["id"])

        yield {"status": "progress",
               "message": f"Found {len(production_folders)} production folder(s), "
                          f"{len(deposition_folders)} deposition folder(s)."}

        # ------------------------------------------------------------------ #
        # 3. Search production folders for responsive files
        # ------------------------------------------------------------------ #
        responsive_files = []  # list of {id, name, folder_name}
        seen_ids = set()

        for prod_folder in production_folders:
            yield {"status": "progress", "message": f"Searching '{prod_folder['name']}'…"}
            for term in search_terms:
                hits = box.search_files_in_folder(prod_folder["id"], term)
                for hit in hits:
                    if hit["id"] not in seen_ids:
                        seen_ids.add(hit["id"])
                        responsive_files.append({**hit, "source_folder": prod_folder["name"]})

        yield {"status": "progress",
               "message": f"Found {len(responsive_files)} responsive document(s) across production folders."}

        if not responsive_files:
            yield {"status": "error",
                   "message": "No responsive documents found. Try broader search terms."}
            return

        # ------------------------------------------------------------------ #
        # 4. Read prior deposition folders for context
        # ------------------------------------------------------------------ #
        prior_exhibit_context = ""
        for dep_folder in deposition_folders:
            yield {"status": "progress", "message": f"Reading prior deposition folder: '{dep_folder['name']}'…"}
            dep_files = box.list_all_files_in_folder(dep_folder["id"])
            for f in dep_files[:10]:  # cap at 10 files for context
                try:
                    file_bytes = box.download_file(f["id"])
                    text = file_reader.extract_text(file_bytes, f["name"])
                    prior_exhibit_context += f"\n\n=== Prior Exhibit: {f['name']} ===\n{text[:3000]}"
                except Exception as e:
                    logger.warning(f"Could not read prior exhibit {f['name']}: {e}")

        # ------------------------------------------------------------------ #
        # 5. Find/create Planning folder inside Depositions folder
        # ------------------------------------------------------------------ #
        depositions_folder = box.get_depositions_parent_folder(case_folder["id"])
        if not depositions_folder:
            yield {"status": "error",
                   "message": "Could not find a 'Depositions' folder inside the case folder. "
                              "Please create one manually, then re-run."}
            return

        planning_folder_name = f"{witness_name} – Dep Prep"
        yield {"status": "progress",
               "message": f"Creating Planning folder: '{planning_folder_name}' in '{depositions_folder['name']}'…"}
        planning_folder = box.create_folder(planning_folder_name, depositions_folder["id"])
        yield {"status": "progress",
               "message": f"Planning folder ready: {planning_folder['id']}"}

        # ------------------------------------------------------------------ #
        # 6. Copy responsive files to Planning folder + get new IDs
        # ------------------------------------------------------------------ #
        copied_files = []
        for f in responsive_files:
            yield {"status": "progress", "message": f"Copying: {f['name']}…"}
            try:
                copied = box.copy_file(f["id"], planning_folder["id"])
                shared_link = box.get_shared_link(copied["id"])
                copied_files.append({
                    "id": copied["id"],
                    "name": copied["name"],
                    "box_url": shared_link,
                    "source_folder": f.get("source_folder", ""),
                })
            except Exception as e:
                logger.warning(f"Could not copy {f['name']}: {e}")

        yield {"status": "progress",
               "message": f"Copied {len(copied_files)} files to Planning folder."}

        # ------------------------------------------------------------------ #
        # 7. Download + extract text from copied files
        # ------------------------------------------------------------------ #
        doc_texts = []
        for f in copied_files:
            yield {"status": "progress", "message": f"Reading: {f['name']}…"}
            try:
                file_bytes = box.download_file(f["id"])
                text = file_reader.extract_text(file_bytes, f["name"])
                doc_texts.append({
                    **f,
                    "text": text[:8000],  # cap per doc to stay within context
                })
            except Exception as e:
                logger.warning(f"Could not read {f['name']}: {e}")
                doc_texts.append({**f, "text": f"[Could not read: {e}]"})

        # ------------------------------------------------------------------ #
        # 8. Claude analysis
        # ------------------------------------------------------------------ #
        yield {"status": "progress", "message": "Analyzing documents with Claude…"}

        client = anthropic.Anthropic()
        outline_data = _analyze_with_claude(
            client=client,
            witness_name=witness_name,
            defendant_abbrev=defendant_abbrev,
            case_name=case_name,
            petition_text=petition_text,
            doc_texts=doc_texts,
            prior_exhibit_context=prior_exhibit_context,
            search_terms=search_terms,
        )

        yield {"status": "progress", "message": "Analysis complete. Building Google Doc…"}

        # ------------------------------------------------------------------ #
        # 9. Build Google Doc title + find target Drive folder
        # ------------------------------------------------------------------ #
        doc_title = f"{plaintiff_last_name}_{defendant_abbrev} – {witness_name} Deposition Outline"

        # Find the Google Drive folder corresponding to the Depositions/Planning folder
        # We use Drive search by name to find the matching folder
        target_drive_folder_id = _find_or_use_root_drive_folder(planning_folder_name, case_name)

        doc_url = gdocs.create_deposition_outline(
            title=doc_title,
            case_caption=outline_data["case_caption"],
            what_we_want=outline_data["what_we_want"],
            overview=outline_data["overview"],
            prefatory_rows=PREFATORY_QUESTIONS,
            rules_of_road=outline_data["rules_of_road"],
            main_sections=outline_data["main_sections"],
            target_folder_id=target_drive_folder_id,
        )

        yield {"status": "done",
               "message": f"Deposition outline created: {doc_title}",
               "url": doc_url,
               "box_planning_folder": f"https://app.box.com/folder/{planning_folder['id']}"}

    except Exception as e:
        logger.exception("Agent failed")
        yield {"status": "error", "message": f"Agent error: {str(e)}"}


def _analyze_with_claude(
    client,
    witness_name: str,
    defendant_abbrev: str,
    case_name: str,
    petition_text: str,
    doc_texts: list,
    prior_exhibit_context: str,
    search_terms: list,
) -> dict:
    """
    Calls Claude to analyze documents and return structured outline data.
    Returns dict with: case_caption, what_we_want, overview, rules_of_road, main_sections
    """
    import json

    docs_block = "\n\n".join(
        f"=== DOCUMENT: {d['name']} (Box URL: {d['box_url']}) ===\n{d['text']}"
        for d in doc_texts
    )

    prompt = f"""You are a plaintiffs' employment litigation attorney preparing a deposition outline.

CASE: {case_name}
WITNESS: {witness_name}
DEFENDANT ABBREVIATION: {defendant_abbrev}

PETITION / CHARGE (case theory):
{petition_text[:4000]}

PRIOR DEPOSITION / EXHIBIT CONTEXT:
{prior_exhibit_context[:3000] if prior_exhibit_context else "None available."}

SEARCH TERMS USED: {', '.join(search_terms)}

RESPONSIVE DOCUMENTS (extracted text):
{docs_block}

---

Your task: Analyze these documents against the case theory and produce a deposition outline.

Return ONLY valid JSON with this exact structure:
{{
  "case_caption": {{
    "plaintiff": "Plaintiff Name",
    "defendant": "Defendant Name",
    "court": "Court Name",
    "case_no": "Case Number if known, else ''",
    "division": "",
    "witness": "{witness_name}"
  }},
  "what_we_want": [
    "2-4 bullet points summarizing key goals for this deposition"
  ],
  "overview": "2-3 paragraph background on this witness and their role in the case.",
  "rules_of_road": [
    {{
      "heading": "Section heading (e.g. discrimination policy, FMLA policy, etc.)",
      "questions": [
        "Question or point as string, OR",
        {{"label": "Exhibit label - Document description", "url": "https://app.box.com/..."}}
      ]
    }}
  ],
  "main_sections": [
    {{
      "heading": "Section heading (chronological topic, e.g. 'Plaintiff's FMLA Request', 'First Corrective Action')",
      "content": "Brief narrative setup for this section (1-2 sentences), or empty string",
      "documents": [
        {{
          "date": "MM/DD/YYYY or empty",
          "ex_num": "exhibit number if known, else empty",
          "description": "Document description",
          "box_url": "https://app.box.com/... (from the document list above)",
          "analysis": [
            "Key point about this document relevant to case theory",
            "Specific page/section reference and question to ask witness"
          ],
          "page_refs": ["Page X, Bates YYYY — quote or summary"]
        }}
      ]
    }}
  ]
}}

Rules:
- Organize main_sections chronologically by date
- Each document entry must use the exact Box URL provided in the document list
- analysis bullets should be specific, actionable deposition questions or observations
- what_we_want should identify the 2-4 most important things to establish with this witness
- overview should explain who this witness is and why they matter to the case
- rules_of_road should cover relevant policies (discrimination, FMLA, handbook, etc.)
- Return ONLY the JSON object, no preamble, no markdown fences
"""

    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=8000,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = response.content[0].text.strip()
    # Strip markdown fences if present
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)

    return json.loads(raw)


def _find_or_use_root_drive_folder(planning_folder_name: str, case_name: str) -> str:
    """
    Try to find the Google Drive folder matching the planning folder name.
    Falls back to root ('root') if not found.
    """
    import google_docs_client as gdocs

    token = gdocs.get_access_token()
    r = requests.get(
        "https://www.googleapis.com/drive/v3/files",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "q": f"name contains '{planning_folder_name}' and mimeType='application/vnd.google-apps.folder'",
            "fields": "files(id,name)",
            "pageSize": 5,
        }
    )
    if r.ok:
        files = r.json().get("files", [])
        if files:
            return files[0]["id"]
    return "root"
