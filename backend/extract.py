import re
from datetime import datetime

import fitz  # PyMuPDF

# ---------------------------------------------------------------- constants

TYPE_KEYWORDS = {
    "prescription": ["prescription", "rx:"],
    "lab_report": ["laboratory", "lab report", "test report", "reference range", "specimen"],
    "imaging": ["radiology", "x-ray", "mri", "ultrasound", "ct scan", "imaging centre",
                "imaging center", "imaging report"],
    "consultation": ["consultation", "chief complaint", "clinical notes", "discharge summary"],
}

DATE_LABELS = [
    r"report date",
    r"date of (?:report|consultation|visit|issue)",
    r"(?:consultation|prescription|issue|visit) date",
    r"date",
]

DATE_PATTERNS = [
    r"\b\d{4}-\d{2}-\d{2}\b",
    r"\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b",
    r"\b\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{4}\b",
    r"\b[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\b",
]

ORG_RE = re.compile(
    r"\b(hospital|clinic|laborator(?:y|ies)|diagnostics?|medical cent(?:re|er)|"
    r"imaging cent(?:re|er)|health ?care|health cent(?:re|er)|nursing home)\b",
    re.I,
)
NOT_ORG_RE = re.compile(r"\b(report|prescription|summary|consultation)\b", re.I)
LABELLED_ORG_RE = re.compile(r"^(?:hospital|clinic|laboratory|lab|facility)\s*[:\-]\s*(.+)$", re.I)

# [ \t] instead of \s so a name can't run onto the next line
DOCTOR_RE = re.compile(r"\bDr\.?[ \t]+[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,2}")

BULLET_RE = re.compile(r"^(?:[-\u2013\u2022*]\s+|\d+[.)]\s+)(.*)$")
NONE_RE = re.compile(r"^(none|nil|n/?a|not (?:reported|stated|applicable|available))\b", re.I)

DIAG_LABELS = ["diagnosis", "diagnoses", "provisional diagnosis"]
MED_LABELS = ["rx", "medications?", "medicines?", "prescribed medications?"]

RX_PREFIX_RE = re.compile(r"^(?:tab|tablet|cap|capsule|syp|syrup|inj)\.?\s+", re.I)
MED_RE = re.compile(
    r"^([A-Za-z][A-Za-z\-]*(?:[ ][A-Za-z][A-Za-z\-]*)?)\s+"
    r"(\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu|units?))(?![\w/])",
    re.I,
)

NUM_RE = re.compile(r"^[<>]?=?\s*\d+(?:\.\d+)?$")
LAB_FALLBACK_RE = re.compile(
    r"^([A-Za-z][A-Za-z0-9 \-\(\)/]*?)\s+([<>]?\d+(?:\.\d+)?)\s+"
    r"([A-Za-z%][A-Za-z0-9%/\.\^]*)\s+"
    r"((?:[<>]=?\s*)?\d+(?:\.\d+)?(?:\s*[-\u2013]\s*\d+(?:\.\d+)?)?)\s*$"
)


# ------------------------------------------------------------- PDF -> text

def extract_text_from_bytes(data: bytes) -> str:
    """Return all text in a PDF. Raises ValueError if it isn't a readable PDF."""
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:
        raise ValueError("File is not a valid PDF")
    try:
        if doc.needs_pass:
            raise ValueError("PDF is password protected")
        return "\n".join(page.get_text() for page in doc)
    finally:
        doc.close()


# ----------------------------------------------------------------- helpers

def detect_type(text):
    head = text[:200]
    scores = {}
    for doc_type, keywords in TYPE_KEYWORDS.items():
        score = 0
        for k in keywords:
            pat = re.compile(r"(?<!\w)" + re.escape(k) + r"(?!\w)", re.I)
            score += len(pat.findall(text)) + 3 * len(pat.findall(head))
        scores[doc_type] = score
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "unknown"


def _parse_date_str(s):
    """Returns (iso_date, ambiguous) or None."""
    s = re.sub(r"[.,]", "", s).strip()
    s = re.sub(r"\s+", " ", s)

    numeric = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", s)
    if numeric:
        a, b, y = map(int, numeric.groups())
        try:
            d = datetime(y, b, a)  # read as DD/MM/YYYY
        except ValueError:
            return None
        return d.date().isoformat(), (a <= 12 and b <= 12 and a != b)

    for fmt in ("%Y-%m-%d", "%d %B %Y", "%d %b %Y", "%B %d %Y", "%b %d %Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat(), False
        except ValueError:
            pass
    return None


def _find_date(s):
    hits = []
    for p in DATE_PATTERNS:
        for m in re.finditer(p, s):
            hits.append((m.start(), m.group()))
    for _, txt in sorted(hits):
        result = _parse_date_str(txt)
        if result:
            return result
    return None


def _find_document_date(lines, text):
    """Returns (iso_date or None, ambiguous, 'labelled' | 'unlabelled' | None)."""
    for label in DATE_LABELS:
        pat = re.compile(rf"^\s*{label}\s*[:\-]\s*(.+)$", re.I)
        for line in lines:
            m = pat.match(line)
            if m:
                result = _find_date(m.group(1))
                if result:
                    return result[0], result[1], "labelled"
    result = _find_date(text)
    if result:
        return result[0], result[1], "unlabelled"
    return None, False, None


def _find_org(lines):
    for line in lines[:8]:
        m = LABELLED_ORG_RE.match(line)
        if m:
            return m.group(1).strip()
        if ":" in line or len(line) > 80:
            continue
        if NOT_ORG_RE.search(line):
            continue
        if ORG_RE.search(line):
            return line
    return None


def _get_section(lines, labels):
    """Find 'Label: text' and any bullet/numbered lines right after it."""
    pat = re.compile(rf"^(?:{'|'.join(labels)})\s*[:\-]\s*(.*)$", re.I)
    for i, line in enumerate(lines):
        m = pat.match(line)
        if m:
            items = []
            first = m.group(1).strip()
            if first:
                items.append(first)
            for nxt in lines[i + 1:]:
                b = BULLET_RE.match(nxt)
                if not b:
                    break
                items.append(b.group(1).strip())
            return items
    return []


def _parse_diagnoses(lines):
    items = []
    for raw in _get_section(lines, DIAG_LABELS):
        for part in raw.split(";"):
            part = part.strip().rstrip(".").strip()
            if part and not NONE_RE.match(part) and part.lower() not in [i.lower() for i in items]:
                items.append(part)
    return items


def _parse_medications(lines, warnings):
    meds = []
    for raw in _get_section(lines, MED_LABELS):
        for item in raw.split(";"):
            item = item.strip()
            if not item or NONE_RE.match(item):
                continue
            item = RX_PREFIX_RE.sub("", item)
            m = MED_RE.match(item)
            if m:
                dosage = re.sub(r"\s+", " ", m.group(2))
                dosage = re.sub(r"(\d)(?=[A-Za-z])", r"\1 ", dosage)
                meds.append({"name": m.group(1).strip(), "dosage": dosage})
            else:
                name = re.split(r"\s[-\u2013\u2014]\s|,", item)[0].strip()
                meds.append({"name": name, "dosage": None})
                warnings.append(f"Dosage not stated for {name}")
    return meds


def _parse_lab_results(lines):
    results = []
    for line in lines:
        row = None
        if "|" in line:
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 3 and re.match(r"^[A-Za-z]", parts[0]) and NUM_RE.match(parts[1]):
                row = (parts[0], parts[1], parts[2], parts[3] if len(parts) > 3 else "")
        else:
            m = LAB_FALLBACK_RE.match(line)
            if m:
                row = m.groups()
        if row:
            test, value, unit, rng = row
            rng = re.sub(r"\s*[-\u2013]\s*", "-", rng) if rng else None
            results.append({
                "test": test,
                "value": value,
                "unit": unit or None,
                "reference_range": rng or None,
            })
    return results


# ------------------------------------------------------------- main parser

def parse_document(text: str) -> dict:
    """Turn raw PDF text into the Record fields from our API contract."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    warnings = []

    doc_type = detect_type(text)
    if doc_type == "unknown":
        warnings.append("Document type could not be determined")

    doc_date, ambiguous, how = _find_document_date(lines, text)
    if doc_date is None:
        warnings.append("Document date not found")
    elif how == "unlabelled":
        warnings.append("Date was not labelled; first date in the document was used")
    if ambiguous:
        warnings.append("Date format is ambiguous; read as DD/MM/YYYY")

    source_name = _find_org(lines)
    if not source_name:
        warnings.append("Hospital or laboratory name not found")

    doctor_match = DOCTOR_RE.search(text)
    doctor_name = doctor_match.group(0).strip() if doctor_match else None

    diagnoses = _parse_diagnoses(lines)
    medications = _parse_medications(lines, warnings)
    lab_results = _parse_lab_results(lines) if doc_type == "lab_report" else []

    if doc_type == "lab_report" and not lab_results:
        warnings.append("No lab results found")
    if doc_type == "prescription" and not medications:
        warnings.append("No medications found")
    if doc_type == "consultation" and not diagnoses:
        warnings.append("No diagnoses found")

    found_anything = (
        doc_type != "unknown" or doc_date or source_name or diagnoses or medications or lab_results
    )
    if not found_anything:
        status = "failed"
    elif warnings:
        status = "partial"
    else:
        status = "complete"

    return {
        "document_type": doc_type,
        "document_date": doc_date,
        "source_name": source_name,
        "extraction_status": status,
        "extracted_data": {
            "doctor_name": doctor_name,
            "diagnoses": diagnoses,
            "medications": medications,
            "lab_results": lab_results,
            "warnings": warnings,
        },
    }


# ---------------------------------------------------- command line testing

if __name__ == "__main__":
    import json
    import sys
    from pathlib import Path

    if len(sys.argv) < 2:
        print("Usage: python extract.py path\\to\\file.pdf [--text]")
        sys.exit(1)

    pdf_text = extract_text_from_bytes(Path(sys.argv[1]).read_bytes())
    if "--text" in sys.argv:
        print(pdf_text)
    else:
        print(json.dumps(parse_document(pdf_text), indent=2))