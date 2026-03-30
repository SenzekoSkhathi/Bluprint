import unittest

from src.academic_rules import ScienceHandbookRulesService
from src.config import Settings


def _build_settings() -> Settings:
    return Settings(
        AWS_ACCESS_KEY_ID="test",
        AWS_SECRET_ACCESS_KEY="test",
        AWS_S3_HANDBOOK_BUCKET="test",
        GEMINI_API_KEY="test",
        BACKEND_DATA_DIR="./data",
    )


def _build_minimal_extracted_payload() -> dict:
    return {
        "run_id": "test-run",
        "handbook_title": "2026 Science-Handbook-UCT",
        "planner_policy": {
            "min_term_credits": 0,
            "max_term_credits": 200,
            "disallow_postgrad_before_year": 4,
            "enforce_unique_courses": True,
            "enforce_prerequisite_sequence": True,
            "bsc_curriculum_min_total_credits": 0,
            "bsc_curriculum_min_science_credits": 0,
            "bsc_curriculum_min_level7_credits": 0,
        },
        "focused_policy_rules": {
            "operational_constraints": {
                "bsc_curriculum": {
                    "min_total_nqf_credits": 0,
                    "min_science_credits": 0,
                    "min_level7_credits": 0,
                },
                "readmission": {
                    "sb001": {"preceding_year_min_credits": 0, "year_end_milestones": []},
                    "sb016": {"preceding_year_min_credits": 0, "year_end_milestones": []},
                },
                "transfer_into_science": {"minimum_requirements": []},
            }
        },
        "rulebook": {
            "bsc_degree_rules": {
                "curriculum_rules": {
                    "majors": {
                        "FB7_5": "At least one approved major is required.",
                        "available_majors": ["Mathematical Statistics", "Computer Science"],
                        "special_constraints": {},
                    }
                }
            }
        },
        "rules": [
            {
                "id": "FB7.6",
                "title": "Prerequisite enforcement",
                "description": "Students must meet prerequisites and co-requisites.",
                "category": "prerequisite",
                "severity": "blocker",
            }
        ],
    }


class AcademicRulesHardeningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = ScienceHandbookRulesService(_build_settings())
        self.service.extract_rules = lambda run_id=None, handbook_title=None: _build_minimal_extracted_payload()

    def test_prerequisite_blocker_when_missing(self) -> None:
        result = self.service.validate_plan(
            planned_courses=[
                {"code": "CSC2001F", "credits": 24, "year": "Year 2", "semester": "Semester 1"}
            ],
            selected_majors=["Computer Science"],
            plan_intent="graduation_candidate",
            validation_mode="strict_graduation",
        )

        titles = [issue.get("title", "") for issue in result.get("issues", [])]
        self.assertTrue(any("Prerequisites not satisfied for CSC2001F" in title for title in titles))

    def test_corequisite_blocker_when_missing(self) -> None:
        result = self.service.validate_plan(
            planned_courses=[
                {"code": "ACC1015S", "credits": 15, "year": "Year 1", "semester": "Semester 2"}
            ],
            plan_intent="graduation_candidate",
            validation_mode="strict_graduation",
        )

        titles = [issue.get("title", "") for issue in result.get("issues", [])]
        self.assertTrue(any("Corequisites not satisfied for ACC1015S" in title for title in titles))

    def test_attempt_history_repeat_warning(self) -> None:
        result = self.service.validate_plan(
            planned_courses=[
                {"code": "CSC2001F", "credits": 24, "year": "Year 2", "semester": "Semester 1"}
            ],
            attempt_history=[
                {"code": "CSC1015F", "passed": False},
                {"code": "CSC1015F", "passed": False},
                {"code": "CSC1015F", "passed": False},
            ],
            plan_intent="graduation_candidate",
        )

        titles = [issue.get("title", "") for issue in result.get("issues", [])]
        self.assertTrue(any("Multiple unsuccessful attempts detected for CSC1015F" in title for title in titles))

    def test_pathway_lock_missing_combination(self) -> None:
        result = self.service.validate_plan(
            planned_courses=[
                {"code": "STA1006S", "credits": 18, "year": "Year 1", "semester": "Semester 2"}
            ],
            selected_majors=["Mathematical Statistics"],
            selected_major_pathways={
                "Mathematical Statistics": {
                    "Year 1": "NON_EXISTENT_COMBINATION"
                }
            },
            plan_intent="graduation_candidate",
        )

        titles = [issue.get("title", "") for issue in result.get("issues", [])]
        self.assertTrue(any("Locked pathway not found for Mathematical Statistics in Year 1" in title for title in titles))


if __name__ == "__main__":
    unittest.main()
