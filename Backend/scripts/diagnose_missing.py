"""Diagnostic: show how MUZ/FIN/SWK/DOH courses appear in the Humanities PDF."""
from pypdf import PdfReader
import re

pdf = PdfReader("Backend/data/handbooks/2026 Humanities-Handbook-UCT.pdf")
pages = [p.extract_text() or "" for p in pdf.pages]

# Show pages 322-327 (0-indexed 321-326) – MUZ course description section
print("=== MUZ COURSE DESCRIPTION PAGES (322-327) ===")
for pg_num in range(321, 327):
    print(f"\n--- PDF Page {pg_num + 1} ---")
    print(pages[pg_num].encode("ascii", "replace").decode())

print("\n\n=== SEARCHING FOR FIN COURSE FORMAT ===")
for i, page in enumerate(pages):
    if re.search(r"\bFIN\d{4}[A-Z]\b", page) and "Convener" in page:
        print(f"\n--- FIN Page {i + 1} ---")
        print(page[:2000].encode("ascii", "replace").decode())
        break

print("\n\n=== SEARCHING FOR SWK CONVENER PAGES ===")
for i, page in enumerate(pages):
    if re.search(r"\bSWK\d{4}[A-Z]\b", page) and "Convener" in page:
        print(f"\n--- SWK Page {i + 1} ---")
        print(page[:2000].encode("ascii", "replace").decode())
        break

print("\n\n=== SEARCHING FOR DOH CONVENER PAGES ===")
for i, page in enumerate(pages):
    if re.search(r"\bDOH\d{4}[A-Z]\b", page) and "Convener" in page:
        print(f"\n--- DOH Page {i + 1} ---")
        print(page[:2000].encode("ascii", "replace").decode())
        break
