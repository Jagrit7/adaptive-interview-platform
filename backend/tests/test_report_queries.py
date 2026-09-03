import os
import sys
import unittest
from pathlib import Path


BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("AGORA_APP_ID", "test-app-id")
os.environ.setdefault("AGORA_APP_CERTIFICATE", "test-cert")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")

from app.routes.report_queries import ReportQueryIntent, parse_report_query


class ReportQueryParserTests(unittest.TestCase):
    def test_spoken_number_and_overall_score(self):
        query = parse_report_query("Show me the top five candidates overall")
        self.assertEqual(query.limit, 5)
        self.assertEqual(query.metric, "overall")
        self.assertIsNone(query.competency)

    def test_competency_and_role(self):
        query = parse_report_query(
            "Top 5 candidates based on system design for the SDE role"
        )
        self.assertEqual(query.limit, 5)
        self.assertEqual(query.metric, "competency")
        self.assertEqual(query.competency, "system design")
        self.assertEqual(query.role, "SDE")

    def test_follow_up_keeps_role_and_replaces_metric(self):
        previous = ReportQueryIntent(
            limit=5,
            metric="competency",
            competency="system design",
            role="SDE",
        )
        query = parse_report_query(
            "Now show the top two based on communication instead",
            previous,
        )
        self.assertEqual(query.limit, 2)
        self.assertEqual(query.metric, "competency")
        self.assertEqual(query.competency, "communication")
        self.assertEqual(query.role, "SDE")

    def test_result_limit_is_capped(self):
        query = parse_report_query("Top 99 candidates overall")
        self.assertEqual(query.limit, 20)


if __name__ == "__main__":
    unittest.main()
