import unittest
from pathlib import Path

from src.handbook_store import HandbookStore
from src.handbook_validator import HandbookValidator


class HandbookPhase2Tests(unittest.TestCase):
    def setUp(self) -> None:
        repo_root = Path(__file__).resolve().parents[1]
        data_dir = repo_root / "data"
        self.store = HandbookStore(data_dir)
        self.validator = HandbookValidator(self.store)

    def test_faculty_summaries_include_all_expected_faculties(self) -> None:
        slugs = {row.slug for row in self.store.summarize_faculties()}
        self.assertTrue({"science", "commerce", "engineering", "health-sciences", "humanities", "law"}.issubset(slugs))

    def test_semester_suffix_policy_blocker_detected(self) -> None:
        result = self.validator.validate_plan(
            planned_courses=[
                {"code": "CSC1015F", "year": "Year 1", "semester": "Semester 2", "credits": 24}
            ],
            target_faculty="science",
        )
        titles = [issue.get("title", "") for issue in result.get("issues", [])]
        self.assertTrue(any("Semester mismatch for CSC1015F" in title for title in titles))

    def test_cross_faculty_code_can_be_validated(self) -> None:
        result = self.validator.validate_plan(
            planned_courses=[
                {"code": "CML3001W", "year": "Year 3", "semester": "Semester 1", "credits": 36}
            ],
            target_faculty="law",
        )
        titles = [issue.get("title", "") for issue in result.get("issues", [])]
        self.assertFalse(any("Course not found in handbook dataset" in title for title in titles))

    def test_unknown_major_is_reported(self) -> None:
        result = self.validator.validate_plan(
            planned_courses=[
                {"code": "CSC1015F", "year": "Year 1", "semester": "Semester 1", "credits": 24}
            ],
            selected_majors=["Nonexistent Major Alpha"],
            target_faculty="science",
        )
        self.assertIn("Nonexistent Major Alpha", result.get("unknown_selected_majors", []))


if __name__ == "__main__":
    unittest.main()
