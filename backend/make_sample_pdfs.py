import shutil
from pathlib import Path

import fitz  # PyMuPDF

OUT_DIR = Path(__file__).parent.parent / "sample_pdfs"

FOOTER = "Synthetic document for hackathon demo. Not real medical data."


def make_pdf(filename, lines):
    doc = fitz.open()
    page = doc.new_page()
    y = 60
    for i, line in enumerate(lines):
        if line == "":
            y += 10
            continue
        size = 16 if i == 0 else 11
        page.insert_text((50, y), line, fontsize=size)
        y += size + 8
    path = OUT_DIR / filename
    doc.save(path)
    doc.close()
    return path


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    make_pdf("01_consultation_report.pdf", [
        "City General Hospital",
        "CONSULTATION REPORT",
        "",
        "Date of Consultation: 14 March 2026",
        "Patient: Demo Patient (synthetic)",
        "Consulting Physician: Dr. Asha Rao",
        "",
        "Chief Complaint: Increased thirst and fatigue for 3 weeks.",
        "",
        "Diagnosis:",
        "- Type 2 diabetes mellitus",
        "- Essential hypertension",
        "",
        "Current medications: None reported.",
        "Advice: Dietary changes, regular exercise, repeat blood tests in 2 weeks.",
        "",
        FOOTER,
    ])

    lab = make_pdf("02_lab_report.pdf", [
        "Sunrise Diagnostics Laboratory",
        "LABORATORY TEST REPORT",
        "",
        "Report Date: 02 April 2026",
        "Sample Collected: 01 April 2026",
        "Patient: Demo Patient (synthetic)",
        "Referred by: Dr. Asha Rao",
        "",
        "Test | Result | Unit | Reference Range",
        "HbA1c | 7.2 | % | 4.0 - 5.6",
        "Fasting Glucose | 138 | mg/dL | 70 - 99",
        "Total Cholesterol | 210 | mg/dL | < 200",
        "Hemoglobin | 13.8 | g/dL | 13.0 - 17.0",
        "",
        FOOTER,
    ])

    # Deliberately has NO hospital name -> should come out as "partial"
    make_pdf("03_prescription.pdf", [
        "PRESCRIPTION",
        "",
        "Date: 10 April 2026",
        "Patient: Demo Patient (synthetic)",
        "Prescribed by: Dr. Vikram Nair",
        "",
        "Diagnosis: Type 2 diabetes mellitus",
        "",
        "Rx:",
        "1. Metformin 500 mg - twice daily after meals",
        "2. Amlodipine 5 mg - once daily in the morning",
        "",
        "Review after 4 weeks.",
        "",
        FOOTER,
    ])

    make_pdf("04_chest_xray_report.pdf", [
        "Metro Imaging Centre",
        "CHEST X-RAY REPORT",
        "",
        "Report Date: 20 April 2026",
        "Patient: Demo Patient (synthetic)",
        "Referred by: Dr. Asha Rao",
        "",
        "Examination: Chest X-ray, PA view",
        "Findings: Lungs are clear. Heart size is within normal limits.",
        "Impression: No acute cardiopulmonary abnormality.",
        "",
        FOOTER,
    ])

    # Byte-identical copy, for testing duplicate detection later
    shutil.copy(lab, OUT_DIR / "02_lab_report_DUPLICATE.pdf")

    print(f"Created sample PDFs in: {OUT_DIR}")


if __name__ == "__main__":
    main()