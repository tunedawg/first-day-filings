"""
fix_templates.py — Rebuilds the tokenized DOCX templates to:
  1. Omnibus: Replace single {{omnibusScheduleBlocks}} row with 8 individual
     deponent rows (3 rows each: Deponent/Date&Time/Location) using per-deponent tokens.
  2. RFPs: Replace hardcoded name lists with {{rfpSubjectListBlock}} and fix
     hardcoded "MCC" references to use {{defendantReferenceName}}.
  3. Rogs: Same name list and MCC fixes.

Run:  python scripts/fix_templates.py
Then: node scripts/upload_templates.js   (re-uploads to Google Drive)
"""

import zipfile, shutil, re, os, sys

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "..", "templates", "final-docx-masters-v2-tokenized")


# ── XML helpers ────────────────────────────────────────────────────────────────

def read_docx_xml(path):
    with zipfile.ZipFile(path) as z:
        return z.read("word/document.xml").decode("utf-8")


def write_docx_xml(src_path, dest_path, new_xml):
    """Copy src_path DOCX to dest_path, replacing word/document.xml."""
    if src_path != dest_path:
        shutil.copy2(src_path, dest_path)
    # Read all files, replace document.xml
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(src_path, "r") as zin:
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == "word/document.xml":
                    zout.writestr(item, new_xml.encode("utf-8"))
                else:
                    zout.writestr(item, zin.read(item.filename))
    with open(dest_path, "wb") as f:
        f.write(buf.getvalue())


def get_para_text(para_xml):
    """Strip XML tags and return visible text of a paragraph."""
    return re.sub(r"<[^>]+>", "", para_xml).strip()


def get_all_para_xmls(doc_xml):
    """Return list of full <w:p ...>...</w:p> XML strings."""
    return re.findall(r"<w:p[ >].*?</w:p>", doc_xml, re.DOTALL)


# ── Omnibus fix ────────────────────────────────────────────────────────────────

LABEL_CELL = """<w:tc><w:tcPr><w:tcW w:w="2592" w:type="dxa"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:widowControl w:val="0"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Century Schoolbook" w:hAnsi="Century Schoolbook"/><w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>{label}</w:t></w:r></w:p></w:tc>"""

SEP_CELL = """<w:tc><w:tcPr><w:tcW w:w="144" w:type="dxa"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:widowControl w:val="0"/><w:spacing w:line="240" w:lineRule="auto"/><w:ind w:left="30"/></w:pPr></w:p></w:tc>"""

VALUE_CELL = """<w:tc><w:tcPr><w:tcW w:w="7056" w:type="dxa"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:widowControl w:val="0"/><w:spacing w:line="240" w:lineRule="auto"/><w:ind w:right="450"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Century Schoolbook" w:hAnsi="Century Schoolbook"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t xml:space="preserve">{token}</w:t></w:r></w:p></w:tc>"""

BLANK_VALUE_CELL = """<w:tc><w:tcPr><w:tcW w:w="7056" w:type="dxa"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:widowControl w:val="0"/><w:spacing w:line="240" w:lineRule="auto"/><w:ind w:right="450"/></w:pPr></w:p></w:tc>"""

# Spacer row between deponents
SPACER_ROW = """<w:tr><w:tc><w:tcPr><w:tcW w:w="9792" w:type="dxa"/><w:gridSpan w:val="3"/><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:line="120" w:lineRule="auto"/></w:pPr></w:p></w:tc></w:tr>"""


def make_deponent_rows(n):
    """Return XML for 3 rows: Deponent/Date&Time/Location for deponent N."""
    rows = []
    rows.append(
        f"<w:tr>{LABEL_CELL.format(label='Deponent:')}{SEP_CELL}{VALUE_CELL.format(token='{{omnibusDeponent' + str(n) + 'Name}}')}</w:tr>"
    )
    rows.append(
        f"<w:tr>{LABEL_CELL.format(label='Date &amp; Time:')}{SEP_CELL}{VALUE_CELL.format(token='{{omnibusDeponent' + str(n) + 'DateTime}}')}</w:tr>"
    )
    rows.append(
        f"<w:tr>{LABEL_CELL.format(label='Location:')}{SEP_CELL}{VALUE_CELL.format(token='{{omnibusDeponent' + str(n) + 'Location}}')}</w:tr>"
    )
    return "\n".join(rows)


def fix_omnibus(xml):
    """Replace the single {{omnibusScheduleBlocks}} table row with 8 deponent row groups."""

    # Find the <w:tr> containing {{omnibusScheduleBlocks}}
    tr_start_idx = xml.find("<w:tr ", xml.find("omnibusScheduleBlocks") - 2000)
    # Back up to find the ACTUAL start of the <w:tr>
    actual_start = xml.rfind("<w:tr ", 0, xml.find("omnibusScheduleBlocks"))
    if actual_start == -1:
        print("  ERROR: Could not find <w:tr containing {{omnibusScheduleBlocks}}")
        return xml

    tr_end = xml.find("</w:tr>", actual_start) + len("</w:tr>")
    old_row = xml[actual_start:tr_end]

    # Build 8 deponent row groups with spacers between them
    all_rows = []
    for n in range(1, 9):
        all_rows.append(make_deponent_rows(n))
        if n < 8:
            all_rows.append(SPACER_ROW)

    replacement = "\n".join(all_rows)
    new_xml = xml[:actual_start] + replacement + xml[tr_end:]
    print(f"  Replaced {{omnibusScheduleBlocks}} row with 8 deponent groups ({len(all_rows)} row blocks)")
    return new_xml


# ── RFP / Rog name-list fix ────────────────────────────────────────────────────

# Names that are hardcoded in the templates and should be removed
HARDCODED_NAMES = {
    "Gabrielle Moore-Jones;",
    "Dr. Samaiyah Jones Scott;",
    "Brandi Fockler;",
    "Tina Hafner;",
    "Tiffany Bradley;",
    "Fred Wise;",
    "Nancy Perez;",
}

# Prefixes for role-based persons that should also be removed
# (they are generated by the rfpSubjectListBlock token)
ROLE_BASED_PREFIXES = [
    "Any person who participated in the decision to discipline",
    "Any person who participated in ",
    "Any person who supervised ",
    "Any person supervised by a person who supervised ",
    "Any person who replaced ",
    "Any person whom you may call to testify",
]

def is_role_based(text):
    return any(text.startswith(p) for p in ROLE_BASED_PREFIXES)


def fix_subject_lists(xml, token="{{rfpSubjectListBlock}}"):
    """
    Find each paragraph sequence starting with '{{plaintiffName}};' followed by
    hardcoded names and role-based persons. Replace the whole sequence with a
    single paragraph containing `token`.
    """
    paras = get_all_para_xmls(xml)
    paras_to_remove = set()
    paras_to_replace = {}  # index -> new text for the w:t inside

    in_subject_list = False

    for i, para in enumerate(paras):
        text = get_para_text(para)

        if text == "{{plaintiffName}};":
            in_subject_list = True
            paras_to_replace[i] = token
        elif in_subject_list and text in HARDCODED_NAMES:
            paras_to_remove.add(i)
        elif in_subject_list and is_role_based(text):
            paras_to_remove.add(i)
        else:
            in_subject_list = False

    if not paras_to_replace:
        print("  No subject list paragraphs found to replace")
        return xml

    # Apply removals first (reverse order to avoid index shifting in the original list)
    new_xml = xml
    removed = 0
    for i in sorted(paras_to_remove, reverse=True):
        old_para = paras[i]
        # Only remove the FIRST occurrence (there may be duplicates in other docs)
        new_xml = new_xml.replace(old_para, "", 1)
        removed += 1

    # Apply replacements: change the text in {{plaintiffName}}; paragraphs
    for i, new_token in paras_to_replace.items():
        old_para = paras[i]
        # Replace the w:t content
        new_para = re.sub(
            r"<w:t[^>]*>\{\{plaintiffName\}\};</w:t>",
            f"<w:t>{new_token}</w:t>",
            old_para,
        )
        new_xml = new_xml.replace(old_para, new_para, 1)

    print(f"  Replaced {len(paras_to_replace)} subject list paragraph(s) with token, removed {removed} hardcoded name paragraph(s)")
    return new_xml


# ── MCC text replacements ──────────────────────────────────────────────────────

# Map of exact <w:t> content → replacement <w:t> content
# (for RFPs)
RFP_TEXT_REPLACEMENTS = [
    # Definitions section
    (
        r"References to  Defendants \{\{allDefendants\}\} include any parents, subsidiaries, and affiliates\. As used here, “MCC” and “Defendants” refer to any of the Defendant entities and any of their parents, subsidiaries, and affiliates\. If Plaintiff is asking about a smaller business unit, that is specified\.",
        "References to Defendants {{allDefendants}} include any parents, subsidiaries, and affiliates. As used here, “{{defendantReferenceName}}” and “Defendants” refer to any of the Defendant entities and any of their parents, subsidiaries, and affiliates. If Plaintiff is asking about a smaller business unit, that is specified.",
    ),
    # Workplace culture
    (
        r"Please produce all internal surveys, reports, or communications regarding workplace culture at MCC, including any employee feedback or concerns about management, leadership, or work environment from 2020 to the present\.",
        "Please produce all internal surveys, reports, or communications regarding workplace culture at {{defendantReferenceName}}, including any employee feedback or concerns about management, leadership, or work environment from {{employmentDateRange}}.",
    ),
    # FVW policy
    (
        r"Please produce all written policies, guidelines, or HR training materials governing how Formal Verbal Warnings are to be initiated, conducted, and evaluated at MCC from 2020 to the present\.",
        "Please produce all written policies, guidelines, or HR training materials governing how Formal Verbal Warnings are to be initiated, conducted, and evaluated at {{defendantReferenceName}} from {{employmentDateRange}}.",
    ),
    # PIP policy
    (
        r"Please produce all written policies, guidelines, or HR training materials governing how Performance Improvement Plans are to be initiated, conducted, and evaluated at MCC from 2020 to the present\.",
        "Please produce all written policies, guidelines, or HR training materials governing how Performance Improvement Plans are to be initiated, conducted, and evaluated at {{defendantReferenceName}} from {{employmentDateRange}}.",
    ),
    # Org charts
    (
        r"Please produce MCC’s complete organizational charts, and any and all drafts from 2020 to the present\.",
        "Please produce {{defendantReferenceName}}’s complete organizational charts, and any and all drafts from {{employmentDateRange}}.",
    ),
    # Program org charts
    (
        r"Please produce the TRIO program’s complete organizational charts, and any and all drafts from 2020 to the present\.",
        "Please produce {{programName}}’s complete organizational charts, and any and all drafts from {{employmentDateRange}}.",
    ),
    # Departure from MCC
    (
        r"Please produce all documents which constitute or reflect communications Defendant or its agents had with any person or entity \(other than counsel\) concerning \{\{plaintiffReferenceName\}\} following her departure from MCC\.",
        "Please produce all documents which constitute or reflect communications Defendant or its agents had with any person or entity (other than counsel) concerning {{plaintiffReferenceName}} following her departure from {{defendantReferenceName}}.",
    ),
    # Diversity training
    (
        r"Please produce all documents which relate to diversity training, or equal opportunity policies implemented by MCC from 2020 to the present\.",
        "Please produce all documents which relate to diversity training, or equal opportunity policies implemented by {{defendantReferenceName}} from {{employmentDateRange}}.",
    ),
    # Leave training
    (
        r"Please produce all documents and trainings which relate to training on varying leave policies, including but not limited to medical and FMLA leave, and reasonable accommodations policies implemented by MCC from 2020 to the present\.",
        "Please produce all documents and trainings which relate to training on varying leave policies, including but not limited to medical and FMLA leave, and reasonable accommodations policies implemented by {{defendantReferenceName}} from {{employmentDateRange}}.",
    ),
]

ROG_TEXT_REPLACEMENTS = [
    # At the MCC who reported
    (
        r"Please identify all individuals at the MCC who have reported any form of discrimination, retaliation, or violations of RSMo 105\.055 to Defendant from 2020 to the present, and state if MCC still employs them and if not, why ",
        "Please identify all individuals at {{defendantReferenceName}} who have reported any form of discrimination, retaliation, or violations of RSMo 105.055 to Defendant from {{employmentDateRange}}, and state if {{defendantReferenceName}} still employs them and if not, why ",
    ),
    # PIP at the MCC
    (
        r"Please identify all employees at the MCC placed on a Performance Improvement Plan \(“PIP”\) from 2020 to the present, and describe the nature ",
        "Please identify all employees at {{defendantReferenceName}} placed on a Performance Improvement Plan (“PIP”) from {{employmentDateRange}}, and describe the nature ",
    ),
    # Terminated at MCC
    (
        r"Please identify all employees employed by Defendants who were terminated or voluntarily ended their employment at MCC, from 2020 to present\. Please identify full name, race, age, known disability status, last known residential address, last known place of employment, last known ",
        "Please identify all employees employed by Defendants who were terminated or voluntarily ended their employment at {{defendantReferenceName}}, from {{employmentDateRange}}. Please identify full name, race, age, known disability status, last known residential address, last known place of employment, last known ",
    ),
    # Essential job function MCC contends
    (
        r"Please describe in detail every essential job function MCC contends required \{\{plaintiffReferenceName\}\}’s in-person attendance, identify ",
        "Please describe in detail every essential job function {{defendantReferenceName}} contends required {{plaintiffReferenceName}}’s in-person attendance, identify ",
    ),
    # Metropolitan Community College remote accommodation
    (
        r"Please identify every employee at Metropolitan Community College who was granted a remote work accommodation for medical reasons from 2020 to present",
        "Please identify every employee at {{defendantReferenceName}} who was granted a remote work accommodation for medical reasons from {{employmentDateRange}}",
    ),
]


def apply_text_replacements(xml, replacements):
    """Apply regex replacements on the full XML text."""
    count = 0
    for pattern, replacement in replacements:
        new_xml, n = re.subn(pattern, replacement, xml, flags=re.UNICODE)
        if n:
            xml = new_xml
            count += n
    print(f"  Applied {count} text replacement(s)")
    return xml


# ── Main ───────────────────────────────────────────────────────────────────────

def process(filename, *fix_fns):
    src = os.path.join(TEMPLATE_DIR, filename)
    if not os.path.exists(src):
        print(f"  SKIP — not found: {filename}")
        return

    print(f"\nProcessing: {filename}")
    xml = read_docx_xml(src)
    for fn in fix_fns:
        xml = fn(xml)
    write_docx_xml(src, src, xml)
    print(f"  Saved: {src}")


def fix_rfps_all(xml):
    xml = fix_subject_lists(xml, "{{rfpSubjectListBlock}}")
    xml = apply_text_replacements(xml, RFP_TEXT_REPLACEMENTS)
    return xml


def fix_rogs_all(xml):
    xml = fix_subject_lists(xml, "{{rfpSubjectListBlock}}")
    xml = apply_text_replacements(xml, ROG_TEXT_REPLACEMENTS)
    return xml


if __name__ == "__main__":
    process("omnibus-notice-template.docx", fix_omnibus)
    process("rfps-template.docx", fix_rfps_all)
    process("interrogatories-template.docx", fix_rogs_all)
    print("\nDone. Run: node scripts/upload_templates.js")
