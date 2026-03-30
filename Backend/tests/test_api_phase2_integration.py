import os
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient


# Ensure required settings exist before importing src.main
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
os.environ.setdefault("AWS_S3_HANDBOOK_BUCKET", "test")
os.environ.setdefault("GEMINI_API_KEY", "test")
os.environ.setdefault("BACKEND_DATA_DIR", "./data")

from src.main import app  # noqa: E402


class Phase2ApiIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_list_handbook_faculties_endpoint(self) -> None:
        response = self.client.get("/rules/handbook/faculties")
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertIn("faculties", payload)
        self.assertIn("total", payload)
        self.assertIn("data_source", payload)
        self.assertEqual(payload.get("data_source"), "structured_handbook_json")

        slugs = {row.get("slug") for row in payload.get("faculties", []) if isinstance(row, dict)}
        expected = {"science", "commerce", "engineering", "health-sciences", "humanities", "law"}
        self.assertTrue(expected.issubset(slugs))

    def test_validate_plan_against_handbook_endpoint(self) -> None:
        response = self.client.post(
            "/rules/handbook/validate-plan",
            json={
                "target_faculty": "science",
                "selected_majors": ["Computer Science"],
                "planned_courses": [
                    {
                        "code": "CSC1015F",
                        "year": "Year 1",
                        "semester": "Semester 2",
                        "credits": 24,
                    }
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("issues", payload)
        self.assertIn("summary", payload)

        titles = [row.get("title", "") for row in payload.get("issues", []) if isinstance(row, dict)]
        self.assertTrue(any("Semester mismatch for CSC1015F" in title for title in titles))

    def test_list_handbook_courses_endpoint(self) -> None:
        response = self.client.post(
            "/courses/handbook/list",
            json={"faculty_slug": "science"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("courses", payload)
        self.assertIn("count", payload)
        self.assertGreater(payload.get("count", 0), 0)

        first = payload.get("courses", [])[0]
        self.assertIn("code", first)
        self.assertIn("title", first)
        self.assertIn("group", first)

    def test_list_handbook_majors_endpoint(self) -> None:
        response = self.client.post(
            "/majors/handbook/list",
            json={"faculty_slug": "science"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("majors", payload)
        self.assertIn("count", payload)
        self.assertGreater(payload.get("count", 0), 0)

        major_names = {
            row.get("major_name", "")
            for row in payload.get("majors", [])
            if isinstance(row, dict)
        }
        self.assertIn("Computer Science", major_names)

    def test_science_validate_plan_endpoint_returns_merged_deterministic_core(self) -> None:
        extracted = {
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
                            "available_majors": ["Computer Science"],
                            "special_constraints": {},
                        }
                    }
                }
            },
            "rules": [],
        }

        with patch("src.academic_rules.ScienceHandbookRulesService.extract_rules", return_value=extracted):
            response = self.client.post(
                "/rules/science/validate-plan",
                json={
                    "planned_courses": [
                        {
                            "code": "CSC1015F",
                            "year": "Year 1",
                            "semester": "Semester 2",
                            "credits": 24,
                        }
                    ],
                    "selected_majors": ["Computer Science"],
                    "plan_intent": "graduation_candidate",
                    "validation_mode": "strict_graduation",
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("deterministic_handbook_core", payload)

    def test_handbook_advisor_endpoint_supports_faculty_routing(self) -> None:
        mocked = {
            "run_id": "test-run",
            "answer": "Use Science as your primary faculty and align cross-major choices to approved routes.",
            "citations": [],
            "retrieval": {},
        }

        with patch("src.main.science_advisor.answer", return_value=mocked):
            response = self.client.post(
                "/advisor/handbook/ask",
                json={
                    "query": "Can I combine Computer Science with a Commerce major?",
                    "top_k": 3,
                    "faculty_slug": "commerce",
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get("requested_faculty"), "commerce")
        self.assertEqual(payload.get("advisor_faculty"), "science")
        self.assertTrue(payload.get("faculty_fallback"))

    def test_handbook_retrieval_endpoint_supports_faculty_routing(self) -> None:
        mocked = {
            "run_id": "test-run",
            "chunks": [{"chunk_id": "abc", "score": 0.9}],
        }

        with patch("src.main.ScienceRetriever.search", return_value=mocked):
            response = self.client.post(
                "/retrieval/handbook/query",
                json={
                    "query": "rules for cross faculty majors",
                    "top_k": 3,
                    "faculty_slug": "commerce",
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get("requested_faculty"), "commerce")
        self.assertEqual(payload.get("retrieval_faculty"), "science")
        self.assertTrue(payload.get("faculty_fallback"))

    def test_handbook_advisor_chat_endpoints_roundtrip(self) -> None:
        faculty_slug = "law"
        thread_id = "test-thread-law-1"
        sync_payload = {
            "faculty_slug": faculty_slug,
            "current_thread_id": thread_id,
            "threads": [
                {
                    "id": thread_id,
                    "title": "Cross-major planning",
                    "custom_title": None,
                    "preview": "Can I combine Science with Law?",
                    "updated_at_iso": "2026-03-29T10:00:00Z",
                    "messages": [
                        {
                            "id": "m1",
                            "text": "Can I combine Science with Law?",
                            "sender": "user",
                            "timestamp_iso": "2026-03-29T10:00:00Z",
                        }
                    ],
                }
            ],
        }

        sync_response = self.client.post("/advisor/handbook/chats/sync", json=sync_payload)
        self.assertEqual(sync_response.status_code, 200)

        list_response = self.client.post(
            "/advisor/handbook/chats/list",
            json={"faculty_slug": faculty_slug},
        )
        self.assertEqual(list_response.status_code, 200)
        listed = list_response.json()
        self.assertEqual(listed.get("current_thread_id"), thread_id)
        self.assertTrue(any(row.get("id") == thread_id for row in listed.get("threads", [])))

        rename_response = self.client.post(
            "/advisor/handbook/chats/rename",
            json={
                "faculty_slug": faculty_slug,
                "thread_id": thread_id,
                "title": "Law cross-major route",
            },
        )
        self.assertEqual(rename_response.status_code, 200)
        self.assertTrue(rename_response.json().get("ok"))

        delete_response = self.client.post(
            "/advisor/handbook/chats/delete",
            json={
                "faculty_slug": faculty_slug,
                "thread_id": thread_id,
            },
        )
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.json().get("ok"))

    def test_handbook_advisor_chat_histories_are_faculty_isolated(self) -> None:
        commerce_faculty = "commerce"
        law_faculty = "law"
        commerce_thread = f"commerce-{uuid4()}"
        law_thread = f"law-{uuid4()}"

        commerce_sync = self.client.post(
            "/advisor/handbook/chats/sync",
            json={
                "faculty_slug": commerce_faculty,
                "current_thread_id": commerce_thread,
                "threads": [
                    {
                        "id": commerce_thread,
                        "title": "Commerce thread",
                        "custom_title": None,
                        "preview": "Commerce planning",
                        "updated_at_iso": "2026-03-29T10:00:00Z",
                        "messages": [],
                    }
                ],
            },
        )
        self.assertEqual(commerce_sync.status_code, 200)

        law_sync = self.client.post(
            "/advisor/handbook/chats/sync",
            json={
                "faculty_slug": law_faculty,
                "current_thread_id": law_thread,
                "threads": [
                    {
                        "id": law_thread,
                        "title": "Law thread",
                        "custom_title": None,
                        "preview": "Law planning",
                        "updated_at_iso": "2026-03-29T10:00:00Z",
                        "messages": [],
                    }
                ],
            },
        )
        self.assertEqual(law_sync.status_code, 200)

        commerce_list = self.client.post(
            "/advisor/handbook/chats/list",
            json={"faculty_slug": commerce_faculty},
        )
        self.assertEqual(commerce_list.status_code, 200)
        commerce_ids = {
            row.get("id")
            for row in commerce_list.json().get("threads", [])
            if isinstance(row, dict)
        }
        self.assertIn(commerce_thread, commerce_ids)
        self.assertNotIn(law_thread, commerce_ids)

        law_list = self.client.post(
            "/advisor/handbook/chats/list",
            json={"faculty_slug": law_faculty},
        )
        self.assertEqual(law_list.status_code, 200)
        law_ids = {
            row.get("id")
            for row in law_list.json().get("threads", [])
            if isinstance(row, dict)
        }
        self.assertIn(law_thread, law_ids)
        self.assertNotIn(commerce_thread, law_ids)

        cleanup_commerce = self.client.post(
            "/advisor/handbook/chats/delete",
            json={"faculty_slug": commerce_faculty, "thread_id": commerce_thread},
        )
        self.assertEqual(cleanup_commerce.status_code, 200)

        cleanup_law = self.client.post(
            "/advisor/handbook/chats/delete",
            json={"faculty_slug": law_faculty, "thread_id": law_thread},
        )
        self.assertEqual(cleanup_law.status_code, 200)


if __name__ == "__main__":
    unittest.main()
