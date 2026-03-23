import re
from typing import Any, Literal

from google import genai

from src.academic_rules import ScienceHandbookRulesService
from src.config import Settings
from src.retrieval import ScienceRetriever


class ScienceAdvisor:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.retriever = ScienceRetriever(settings)
        self.rules_service = ScienceHandbookRulesService(settings)

    def _build_context(self, hits: list[dict]) -> str:
        blocks: list[str] = []
        for index, hit in enumerate(hits, start=1):
            blocks.append(
                "\n".join(
                    [
                        f"[Source {index}]",
                        f"Title: {hit.get('title', '')}",
                        f"S3 Key: {hit.get('s3_key', '')}",
                        f"Score: {round(float(hit.get('score', 0.0)), 6)}",
                        f"Chunk: {hit.get('text', '')}",
                    ]
                )
            )
        return "\n\n".join(blocks)

    def _build_policy_context(self, run_id: str | None = None) -> tuple[str, list[dict]]:
        try:
            extracted = self.rules_service.extract_rules(
                run_id=run_id,
                handbook_title="2026 Science-Handbook-UCT",
            )
        except Exception:
            return "", []

        focused = extracted.get("focused_policy_rules", {})
        rulebook = extracted.get("rulebook", {})
        if not focused and not rulebook:
            return "", []

        readmission = focused.get("readmission_from_2023", {})
        sb001 = readmission.get("sb001", {}).get("requirements", {})
        sb016 = readmission.get("sb016", {}).get("requirements", {})
        transfer = focused.get("transfer_into_science", {})
        bsc_mins = focused.get("bsc_curricula_rules", {}).get("minimum_requirements", {})

        bsc_rules = rulebook.get("bsc_degree_rules", {}) if isinstance(rulebook, dict) else {}
        registration = bsc_rules.get("registration_limits", {})
        supplementary = bsc_rules.get("supplementary_examinations", {})
        curriculum = bsc_rules.get("curriculum_rules", {})
        majors = curriculum.get("majors", {})
        math_requirement = curriculum.get("mathematics_requirement", {})
        prerequisite_note = curriculum.get("prerequisites_critical_note", {})
        third_year_per_major = curriculum.get("third_year_credits_per_major", {})
        course_codes = rulebook.get("course_code_system", {}) if isinstance(rulebook, dict) else {}
        terminology = rulebook.get("essential_terminology", {}) if isinstance(rulebook, dict) else {}

        max_term = focused.get("operational_constraints", {}).get("registration", {}).get(
            "max_term_credits"
        )
        if not max_term and isinstance(registration, dict):
            fb3_text = str(registration.get("FB3") or "")
            max_term_match = [int(part) for part in re.findall(r"\d+", fb3_text)]
            max_term = max_term_match[0] if max_term_match else "n/a"

        lines: list[str] = [
            "Use these policy constraints from the 2026 Science Handbook when relevant:",
            "- Readmission (SB001, FB5.1): preceding year minimum credits = "
            f"{sb001.get('preceding_year_min_credits', 'n/a')}.",
            "- Readmission (SB016, FB5.2): preceding year minimum credits = "
            f"{sb016.get('preceding_year_min_credits', 'n/a')} (except first registration year).",
            "- Transfer into Science (FB6):",
        ]

        for requirement in transfer.get("minimum_requirements", []):
            lines.append(f"  - {requirement}")

        lines.extend(
            [
                "- BSc curriculum minima (FB7):",
                "  - Total NQF credits: "
                f"{bsc_mins.get('min_total_nqf_credits', 'n/a')}",
                "  - Science credits: "
                f"{bsc_mins.get('min_science_credits', 'n/a')}",
                "  - Level 7 credits: "
                f"{bsc_mins.get('min_level7_credits', 'n/a')}",
                "- Registration limit (FB3):",
                f"  - Maximum credits per semester: {max_term}",
                "- Course code semantics:",
                f"  - F={course_codes.get('codes', {}).get('F', 'First-semester')}",
                f"  - S={course_codes.get('codes', {}).get('S', 'Second-semester')}",
                f"  - H={course_codes.get('codes', {}).get('H', 'Full-year half-credit')}",
                f"  - W={course_codes.get('codes', {}).get('W', 'Full-year full-credit')}",
                "- Prerequisite enforcement:",
                f"  - {prerequisite_note.get('FB7_6_note3', terminology.get('prerequisite', ''))}",
                "- Mathematics/Statistics core rule (FB7.3):",
                f"  - {math_requirement.get('FB7_3', 'Apply handbook mathematics/statistics requirement.')}",
                "- Major constraints (FB7.5/FB7.7):",
                f"  - {majors.get('FB7_5', 'At least one approved major is required.')}",
                "  - Business Computing must be paired with Computer Science.",
                "  - Computer Engineering must be paired with Computer Science.",
                "  - Applied Statistics / Mathematical Statistics / Statistics & Data Science are mutually exclusive.",
                f"  - {third_year_per_major.get('FB7_7', 'At least 72 level-7 credits per major.')}",
                "- Supplementary exam limits:",
                "  - First-year: up to 108 credits.",
                "  - Non-first-year: up to 120 credits, of which up to 72 may be third-year.",
                f"  - {supplementary.get('FB4_3', '')}",
            ]
        )

        policy_citations = [
            {
                "title": "2026 Science Handbook FB5.1 (SB001 readmission)",
                "s3_key": "policy:FB5.1",
                "score": 1.0,
            },
            {
                "title": "2026 Science Handbook FB5.2 (SB016 readmission)",
                "s3_key": "policy:FB5.2",
                "score": 1.0,
            },
            {
                "title": "2026 Science Handbook FB6 (transfer into Science)",
                "s3_key": "policy:FB6",
                "score": 1.0,
            },
            {
                "title": "2026 Science Handbook FB7 (BSc curricula rules)",
                "s3_key": "policy:FB7",
                "score": 1.0,
            },
            {
                "title": "2026 Science Handbook FB3 (registration limits)",
                "s3_key": "policy:FB3",
                "score": 1.0,
            },
            {
                "title": "2026 Science Handbook FB4 (supplementary examinations)",
                "s3_key": "policy:FB4",
                "score": 1.0,
            },
            {
                "title": "2026 Science Handbook course code system",
                "s3_key": "policy:course-code-system",
                "score": 1.0,
            },
        ]

        return "\n".join(lines), policy_citations

    def _resolve_model(
        self,
        model_profile: Literal["fast", "thinking"] | None = None,
    ) -> str:
        if model_profile == "fast":
            return self.settings.gemini_fast_model
        if model_profile == "thinking":
            return self.settings.gemini_thinking_model
        return self.settings.gemini_model

    def _resolve_top_k(
        self,
        top_k: int,
        model_profile: Literal["fast", "thinking"] | None,
    ) -> int:
        if model_profile == "fast":
            # Fast mode keeps retrieval narrow to reduce context size and latency.
            return max(1, min(top_k, 2))
        if model_profile == "thinking":
            return max(6, top_k)
        return top_k

    def _include_policy_context(
        self,
        model_profile: Literal["fast", "thinking"] | None,
    ) -> bool:
        return model_profile != "fast"

    def _build_generation_config(
        self,
        model_profile: Literal["fast", "thinking"] | None,
    ) -> dict[str, Any]:
        if model_profile == "fast":
            # Keep latency low: short output and no reasoning budget.
            return {
                "temperature": 0.2,
                "max_output_tokens": 220,
                "thinking_config": {"thinking_budget": 0},
            }

        if model_profile == "thinking":
            # Allow deeper reasoning and longer structured guidance.
            return {
                "temperature": 0.1,
                "max_output_tokens": 700,
                "thinking_config": {"thinking_budget": 2048},
            }

        return {
            "temperature": 0.2,
            "max_output_tokens": 420,
        }

    def _build_student_context_block(self, student_context: dict) -> str:
        """Format a student's complete academic profile into a prompt block.

        This is the intelligence core: Gemini will use this to answer questions
        like "can I take X?" or "am I on track?" with full knowledge of the
        student's actual history — not just generic handbook rules.
        """
        if not student_context:
            return ""

        lines: list[str] = ["=== STUDENT ACADEMIC PROFILE ==="]

        # Identity
        name = student_context.get("name", "")
        snum = student_context.get("student_number", "")
        degree = student_context.get("degree", "")
        year = student_context.get("year")
        majors = student_context.get("majors", [])

        identity_parts: list[str] = []
        if name:
            identity_parts.append(name)
        if snum:
            identity_parts.append(f"Student No: {snum}")
        if identity_parts:
            lines.append(" | ".join(identity_parts))

        if degree:
            degree_line = degree
            if year:
                degree_line += f" | Year {year} of 4"
            lines.append(degree_line)

        if majors:
            majors_str = ", ".join(majors) if isinstance(majors, list) else str(majors)
            lines.append(f"Majors: {majors_str}")

        # Credit standing
        credits_earned = student_context.get("credits_earned")
        credits_total = student_context.get("credits_total", 360)
        nqf7_earned = student_context.get("nqf7_credits_earned")
        nqf7_required = student_context.get("nqf7_credits_required", 120)
        milestone_label = student_context.get("milestone_label", "")
        milestone_required = student_context.get("milestone_required")

        credit_parts: list[str] = []
        if credits_earned is not None:
            credit_parts.append(f"Credits: {credits_earned}/{credits_total} earned")
        if nqf7_earned is not None:
            credit_parts.append(f"NQF7: {nqf7_earned}/{nqf7_required}")
        if credit_parts:
            lines.append(" | ".join(credit_parts))

        if milestone_label and milestone_required is not None:
            on_track = credits_earned >= milestone_required if credits_earned is not None else None
            status = " — ON TRACK" if on_track else (" — BEHIND MILESTONE" if on_track is False else "")
            lines.append(f"Milestone: {milestone_label}{status}")

        # Completed — passed
        completed_passed: list[dict] = student_context.get("completed_passed", [])
        if completed_passed:
            lines.append(f"\nCompleted courses — passed ({len(completed_passed)} courses):")
            for c in completed_passed[:40]:
                grade_str = f" | {c.get('grade')}%" if c.get("grade") is not None else ""
                lines.append(
                    f"  {c.get('code', '?')} | {c.get('title', '')} | {c.get('credits', 0)} cr"
                    f" | NQF{c.get('nqf_level', '?')} | {c.get('semester', '')}{grade_str}"
                )

        # Completed — failed
        completed_failed: list[dict] = student_context.get("completed_failed", [])
        if completed_failed:
            lines.append(f"\nFailed / incomplete ({len(completed_failed)} courses):")
            for c in completed_failed[:10]:
                grade_str = f" | {c.get('grade')}%" if c.get("grade") is not None else ""
                lines.append(
                    f"  {c.get('code', '?')} | {c.get('title', '')} | {c.get('credits', 0)} cr{grade_str}"
                )

        # In progress
        in_progress: list[dict] = student_context.get("courses_in_progress", [])
        if in_progress:
            lines.append(f"\nCurrently registered — in progress ({len(in_progress)} courses):")
            for c in in_progress[:20]:
                lines.append(
                    f"  {c.get('code', '?')} | {c.get('title', '')} | {c.get('credits', 0)} cr"
                    f" | NQF{c.get('nqf_level', '?')} | {c.get('semester', '')}"
                )

        lines.append("=================================")
        return "\n".join(lines)

    def answer(
        self,
        query: str,
        run_id: str | None = None,
        top_k: int = 5,
        model_profile: Literal["fast", "thinking"] | None = None,
        student_context: dict | None = None,
    ) -> dict:
        effective_top_k = self._resolve_top_k(top_k, model_profile)
        retrieval = self.retriever.search(
            query=query,
            run_id=run_id,
            top_k=effective_top_k,
            fast_mode=model_profile == "fast",
        )
        hits = retrieval.get("hits", [])
        if self._include_policy_context(model_profile):
            policy_context, policy_citations = self._build_policy_context(
                run_id=retrieval.get("run_id")
            )
        else:
            policy_context, policy_citations = "", []

        student_block = self._build_student_context_block(student_context or {})

        if not hits and not policy_context and not student_block:
            return {
                "run_id": retrieval.get("run_id"),
                "answer": "I could not find any indexed science handbook context for this query yet.",
                "citations": [],
                "retrieval": retrieval,
            }

        context_block = self._build_context(hits)
        handbook_context_sections: list[str] = []
        if policy_context:
            handbook_context_sections.append(f"Policy constraints:\n{policy_context}")
        if context_block:
            handbook_context_sections.append(f"Retrieved handbook context:\n{context_block}")

        handbook_context = "\n\n".join(handbook_context_sections)

        # Student block always leads the prompt so the model grounds every answer
        # against this specific student's actual academic history.
        student_section = f"{student_block}\n\n" if student_block else ""

        if model_profile == "fast":
            prompt = (
                "You are BluBot, an academic advisor assistant for UCT Science Faculty students. "
                "You are grounded in the provided handbook context AND the specific student's academic profile shown below. "
                "When the student asks about eligibility, prerequisites, or progress — check their completed courses list first. "
                "Give a quick, practical answer in 3-4 short bullet points. "
                "If a prerequisite is missing from their completed courses, name it explicitly. "
                "If uncertain, explicitly say what is missing in one short line. "
                "End with a short 'Sources' section using Source numbers.\n\n"
                f"{student_section}"
                f"Student query:\n{query}\n\n"
                f"Handbook context:\n{handbook_context}"
            )
        elif model_profile == "thinking":
            prompt = (
                "You are BluBot, an academic advisor assistant for UCT Science Faculty students. "
                "You are grounded in the provided handbook context AND the specific student's academic profile shown below. "
                "When answering, always cross-reference the student's completed courses against any prerequisite requirements before giving eligibility guidance. "
                "Always apply the policy constraints section when the question relates to readmission, transfer, planning, progression, or BSc curriculum requirements. "
                "Do a two-pass internal check before finalizing: "
                "  Pass 1 — draft your guidance based on the handbook rules. "
                "  Pass 2 — verify each claim against the student's actual course history and correct any assumption that doesn't match their record. "
                "Only output the final answer (not the internal draft/checklist). "
                "Answer with concise but thorough practical steps. "
                "If a prerequisite is missing from their completed courses, name it explicitly. "
                "If uncertain, explicitly say what is missing. "
                "End with a short 'Sources' section using Source numbers.\n\n"
                f"{student_section}"
                f"Student query:\n{query}\n\n"
                f"Handbook context:\n{handbook_context}"
            )
        else:
            prompt = (
                "You are BluBot, an academic advisor assistant for UCT Science Faculty students. "
                "You are grounded in the provided handbook context AND the specific student's academic profile shown below. "
                "When the student asks about eligibility or prerequisites, check their completed courses list against the handbook rules. "
                "Always apply the policy constraints section when the question relates to readmission, transfer, planning, progression, or BSc curriculum requirements. "
                "Answer the student query with concise, practical guidance. "
                "If a prerequisite is missing from their completed courses, name it explicitly. "
                "If uncertain, explicitly say what is missing. "
                "End with a short 'Sources' section using Source numbers.\n\n"
                f"{student_section}"
                f"Student query:\n{query}\n\n"
                f"Handbook context:\n{handbook_context}"
            )
        resolved_model = self._resolve_model(model_profile)
        generation_config = self._build_generation_config(model_profile)

        try:
            response = self.client.models.generate_content(
                model=resolved_model,
                contents=prompt,
                config=generation_config,
            )
        except Exception:
            # Backward-safe fallback for SDK versions that may not support config keys.
            response = self.client.models.generate_content(
                model=resolved_model,
                contents=prompt,
            )

        citations = [
            {
                "source": idx + 1,
                "title": hit.get("title", ""),
                "s3_key": hit.get("s3_key", ""),
                "score": hit.get("score", 0.0),
            }
            for idx, hit in enumerate(hits)
        ]
        policy_start = len(citations)
        citations.extend(
            {
                "source": policy_start + idx + 1,
                "title": citation.get("title", ""),
                "s3_key": citation.get("s3_key", ""),
                "score": citation.get("score", 0.0),
            }
            for idx, citation in enumerate(policy_citations)
        )

        return {
            "run_id": retrieval.get("run_id"),
            "answer": getattr(response, "text", "") or "No response generated.",
            "model_profile": model_profile or "default",
            "model": resolved_model,
            "effective_top_k": effective_top_k,
            "citations": citations,
            "retrieval": retrieval,
        }
