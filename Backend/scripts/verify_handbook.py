"""Comprehensive verification of all handbook data files."""
import json
import os
import glob
import re

BASE = os.path.join(os.path.dirname(__file__), '..', 'data', 'handbook', 'faculties')

issues = []

print('=' * 60)
print('COMPREHENSIVE HANDBOOK DATA VERIFICATION')
print('=' * 60)

FACULTIES = ['commerce', 'engineering', 'health-sciences', 'humanities', 'law', 'science']
INDEXED_FACULTIES = ['commerce', 'engineering', 'health-sciences', 'humanities', 'law']

# ============================================================
# 1. META.JSON CONSISTENCY
# ============================================================
print('\n--- 1. META.JSON FIELD CONSISTENCY ---')

for faculty in FACULTIES:
    path = os.path.join(BASE, faculty, 'meta.json')
    with open(path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    for field in ['faculty', 'faculty_slug', 'year', 'departments', 'contact']:
        if field not in meta:
            issues.append(f'{faculty}/meta.json: MISSING required field "{field}"')

    has_prefixes = 'department_prefixes' in meta or 'science_department_prefixes' in meta
    has_quals = 'qualifications' in meta

    slug = meta.get('faculty_slug', '?')
    year = meta.get('year', '?')
    depts = len(meta.get('departments', []))

    prefix_field = 'department_prefixes' if 'department_prefixes' in meta else 'science_department_prefixes'
    prefixes = len(meta.get(prefix_field, []))

    warns = []
    if not has_prefixes:
        warns.append('no prefixes')
        issues.append(f'{faculty}/meta.json: no department_prefixes field')
    if not has_quals:
        warns.append('no qualifications')
        issues.append(f'{faculty}/meta.json: no qualifications field')

    status = ', '.join(warns) if warns else 'OK'
    print(f'  {faculty}: slug={slug}, year={year}, {depts} depts, {prefixes} prefixes - {status}')

# ============================================================
# 2. COURSE CODE FORMAT VALIDATION
# ============================================================
print('\n--- 2. COURSE CODE FORMAT VALIDATION ---')

code_pattern = re.compile(r'^[A-Z]{2,4}\d{4}[A-Z]$')

for faculty in INDEXED_FACULTIES:
    idx_path = os.path.join(BASE, faculty, 'courses', '_index.json')
    with open(idx_path, 'r', encoding='utf-8') as f:
        idx = json.load(f)

    bad_codes = [c.get('code', '') for c in idx.get('courses', []) if not code_pattern.match(c.get('code', ''))]

    if bad_codes:
        print(f'  {faculty}: {len(bad_codes)} invalid codes: {bad_codes[:5]}')
        issues.append(f'{faculty}: invalid course codes: {bad_codes}')
    else:
        print(f'  {faculty}: all {len(idx["courses"])} codes valid')

# Science uses individual files
sci_files = glob.glob(os.path.join(BASE, 'science', 'courses', '*.json'))
bad_sci = [os.path.basename(f).replace('.json', '') for f in sci_files
           if not code_pattern.match(os.path.basename(f).replace('.json', ''))
           and os.path.basename(f) != '_index.json']
if bad_sci:
    print(f'  science: {len(bad_sci)} invalid codes: {bad_sci[:5]}')
else:
    print(f'  science: all {len(sci_files)} codes valid')

# ============================================================
# 3. SEMESTER SUFFIX CONSISTENCY
# ============================================================
print('\n--- 3. SEMESTER SUFFIX CONSISTENCY ---')

valid_suffixes = {
    'F': 'S1', 'S': 'S2', 'W': 'FY', 'H': 'FY',
    'X': 'varies', 'Z': 'varies', 'M': 'varies',
    'L': 'winter', 'U': 'summer', 'P': 'summer',
    'A': 'Q1', 'B': 'Q2', 'C': 'Q3', 'D': 'Q4',
    'J': 'summer', 'Q': 'S1', 'R': 'S2'
}

for faculty in INDEXED_FACULTIES:
    idx_path = os.path.join(BASE, faculty, 'courses', '_index.json')
    with open(idx_path, 'r', encoding='utf-8') as f:
        idx = json.load(f)

    mismatches = []
    for c in idx.get('courses', []):
        code = c.get('code', '')
        semester = c.get('semester', '')
        suffix = code[-1] if code else ''
        expected = valid_suffixes.get(suffix, 'varies')
        if semester != expected:
            mismatches.append(f'{code}: got "{semester}" expected "{expected}"')

    if mismatches:
        print(f'  {faculty}: {len(mismatches)} semester mismatches: {mismatches[:3]}')
        issues.append(f'{faculty}: semester mismatches ({len(mismatches)})')
    else:
        print(f'  {faculty}: all semesters match suffix codes')

# ============================================================
# 4. PROGRAMME COURSE REFERENCES
# ============================================================
print('\n--- 4. PROGRAMME COURSE REFERENCES ---')

for faculty in INDEXED_FACULTIES:
    idx_path = os.path.join(BASE, faculty, 'courses', '_index.json')
    with open(idx_path, 'r', encoding='utf-8') as f:
        idx = json.load(f)

    known_codes = {c['code'] for c in idx.get('courses', [])}

    majors_dir = os.path.join(BASE, faculty, 'majors')
    if not os.path.isdir(majors_dir):
        continue

    orphan_refs = []
    for mf in glob.glob(os.path.join(majors_dir, '*.json')):
        with open(mf, 'r', encoding='utf-8') as f:
            prog = json.load(f)

        prog_name = prog.get('id', os.path.basename(mf))
        curriculum = prog.get('curriculum', {})

        if isinstance(curriculum, list):
            # Commerce-style: list of year dicts
            for year_data in curriculum:
                if not isinstance(year_data, dict):
                    continue
                for list_key in ['core', 'elective_pool', 'electives']:
                    for code in year_data.get(list_key, []):
                        if code not in known_codes:
                            orphan_refs.append(f'{prog_name}/{list_key}: {code}')
        elif isinstance(curriculum, dict):
            for year_key, year_data in curriculum.items():
                if not isinstance(year_data, dict):
                    continue
                for list_key in ['core', 'elective_pool', 'studiowork_choices',
                                 'specialisation_choices', 'credits_from_mbchb',
                                 'additional_courses']:
                    for code in year_data.get(list_key, []):
                        if code not in known_codes:
                            orphan_refs.append(f'{prog_name}/{year_key}/{list_key}: {code}')

    if orphan_refs:
        print(f'  {faculty}: {len(orphan_refs)} course refs not in _index.json')
        for ref in orphan_refs[:10]:
            print(f'    - {ref}')
        if len(orphan_refs) > 10:
            print(f'    ... and {len(orphan_refs) - 10} more')
        issues.append(f'{faculty}: {len(orphan_refs)} orphan course references')
    else:
        print(f'  {faculty}: all programme course refs found in index')

# ============================================================
# 5. DUPLICATE COURSE CHECK
# ============================================================
print('\n--- 5. DUPLICATE COURSE CHECK ---')

for faculty in INDEXED_FACULTIES:
    idx_path = os.path.join(BASE, faculty, 'courses', '_index.json')
    with open(idx_path, 'r', encoding='utf-8') as f:
        idx = json.load(f)

    codes = [c['code'] for c in idx.get('courses', [])]
    dupes = set([c for c in codes if codes.count(c) > 1])
    if dupes:
        print(f'  {faculty}: DUPLICATES: {dupes}')
        issues.append(f'{faculty}: duplicate courses: {dupes}')
    else:
        print(f'  {faculty}: no duplicates')

# ============================================================
# 6. YEAR LEVEL CONSISTENCY
# ============================================================
print('\n--- 6. YEAR LEVEL VS CODE CHECK ---')

for faculty in INDEXED_FACULTIES:
    idx_path = os.path.join(BASE, faculty, 'courses', '_index.json')
    with open(idx_path, 'r', encoding='utf-8') as f:
        idx = json.load(f)

    mismatches = []
    for c in idx.get('courses', []):
        code = c.get('code', '')
        yl = c.get('year_level', 0)
        expected_yl = 0
        for ch in code:
            if ch.isdigit():
                expected_yl = int(ch)
                break

        if yl != expected_yl:
            mismatches.append(f'{code}: stored={yl} expected={expected_yl}')

    if mismatches:
        print(f'  {faculty}: {len(mismatches)} year level mismatches')
        for m in mismatches[:3]:
            print(f'    - {m}')
        issues.append(f'{faculty}: year level mismatches ({len(mismatches)})')
    else:
        print(f'  {faculty}: all year levels correct')

# ============================================================
# 7. CROSS-FACULTY COURSE FLAGGING
# ============================================================
print('\n--- 7. CROSS-FACULTY COURSE FLAGGING ---')

for faculty in INDEXED_FACULTIES:
    idx_path = os.path.join(BASE, faculty, 'courses', '_index.json')
    meta_path = os.path.join(BASE, faculty, 'meta.json')
    with open(idx_path, 'r', encoding='utf-8') as f:
        idx = json.load(f)
    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    prefix_field = 'department_prefixes'
    own_prefixes = set(meta.get(prefix_field, []))

    cross_depts = meta.get('cross_faculty_departments', [])
    cross_prefixes = {d['prefix'] for d in cross_depts}

    unflagged = []
    for c in idx.get('courses', []):
        prefix = c.get('department_prefix', '')
        # Check if this is a cross-faculty course that should be flagged
        if prefix in cross_prefixes:
            flag_key = f'is_{faculty.replace("-", "_")}_course'
            alt_flags = [k for k in c.keys() if k.startswith('is_') and k.endswith('_course')]
            offered_by = c.get('offered_by_faculty', None)
            if not alt_flags and not offered_by:
                unflagged.append(c['code'])

    if unflagged:
        print(f'  {faculty}: {len(unflagged)} cross-faculty courses not flagged: {unflagged[:5]}')
        issues.append(f'{faculty}: {len(unflagged)} unflagged cross-faculty courses')
    else:
        print(f'  {faculty}: cross-faculty flagging OK')

# ============================================================
# 8. EQUIVALENCES FILE CHECK
# ============================================================
print('\n--- 8. EQUIVALENCES FILE CHECK ---')

for faculty in FACULTIES:
    eq_path = os.path.join(BASE, faculty, 'equivalences.json')
    if os.path.exists(eq_path):
        with open(eq_path, 'r', encoding='utf-8') as f:
            eq = json.load(f)
        count = len(eq.get('equivalences', []))
        print(f'  {faculty}: {count} equivalence entries')
    else:
        print(f'  {faculty}: NO equivalences.json')
        issues.append(f'{faculty}: missing equivalences.json')

# ============================================================
# 9. RULES FILE CHECK
# ============================================================
print('\n--- 9. RULES FILE CHECK ---')

for faculty in FACULTIES:
    rules_path = os.path.join(BASE, faculty, 'rules', 'faculty_rules.json')
    rules_dir = os.path.join(BASE, faculty, 'rules')
    if os.path.exists(rules_path):
        with open(rules_path, 'r', encoding='utf-8') as f:
            rules = json.load(f)
        sections = len(rules.get('rules', rules.get('rule_sets', {})))
        print(f'  {faculty}: faculty_rules.json with {sections} sections')
    elif os.path.isdir(rules_dir):
        rule_files = glob.glob(os.path.join(rules_dir, '*.json'))
        print(f'  {faculty}: {len(rule_files)} individual rule files (alternate structure)')
    else:
        print(f'  {faculty}: NO rules directory')
        issues.append(f'{faculty}: missing rules')

# ============================================================
# 10. MAJORS COUNT AND ID UNIQUENESS
# ============================================================
print('\n--- 10. MAJORS COUNT AND ID UNIQUENESS ---')

all_ids = {}
for faculty in FACULTIES:
    majors_dir = os.path.join(BASE, faculty, 'majors')
    if not os.path.isdir(majors_dir):
        print(f'  {faculty}: no majors/ directory')
        continue

    major_files = glob.glob(os.path.join(majors_dir, '*.json'))
    ids = []
    for mf in major_files:
        with open(mf, 'r', encoding='utf-8') as f:
            prog = json.load(f)
        pid = prog.get('id', os.path.basename(mf))
        ids.append(pid)
        if pid in all_ids:
            issues.append(f'Duplicate programme ID "{pid}" in {faculty} and {all_ids[pid]}')
        all_ids[pid] = faculty

    dupes = set([i for i in ids if ids.count(i) > 1])
    if dupes:
        print(f'  {faculty}: {len(major_files)} majors, DUPLICATE IDs: {dupes}')
    else:
        print(f'  {faculty}: {len(major_files)} majors, all IDs unique')

# ============================================================
# SUMMARY
# ============================================================
print('\n' + '=' * 60)
if issues:
    print(f'TOTAL ISSUES FOUND: {len(issues)}')
    for i, issue in enumerate(issues, 1):
        print(f'  {i}. {issue}')
else:
    print('ALL CHECKS PASSED - NO ISSUES FOUND')
print('=' * 60)
