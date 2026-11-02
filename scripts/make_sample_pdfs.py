"""Generate three tiny sample PDFs (invoice / packing list / bill of lading) into ./samples."""
from pathlib import Path

import pymupdf

OUT = Path(__file__).resolve().parent.parent / "samples"
OUT.mkdir(exist_ok=True)
DOCS = {
    "invoice": ["COMMERCIAL INVOICE INV-2024-0815", "LED panel light 40W  qty 2400  USD 6.80", "Total USD 16320.00", "Gross weight 3120 kg"],
    "packing_list": ["PACKING LIST PL-2024-0815", "LED panel light 40W  qty 2400", "120 cartons", "Gross weight 3165 kg"],
    "bill_of_lading": ["BILL OF LADING NSA-BL-778812", "120 packages", "Gross weight 3165 kg"],
}
for name, lines in DOCS.items():
    d = pymupdf.open()
    p = d.new_page()
    for i, line in enumerate(lines):
        p.insert_text((60, 80 + 24 * i), line, fontsize=12)
    d.save(OUT / f"{name}.pdf")
    d.close()
print("wrote", ", ".join(f"{n}.pdf" for n in DOCS))
