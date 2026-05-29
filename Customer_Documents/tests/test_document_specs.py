from __future__ import annotations

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "generator"))

import generate_documents as docs  # noqa: E402
import generate_articles_of_incorporation as articles  # noqa: E402
import generate_kyc_documents as kyc  # noqa: E402


class CustomerDocumentSpecTests(unittest.TestCase):
    def test_catalog_has_expected_starting_coverage(self) -> None:
        self.assertEqual(len(docs.SPECS), 9)
        self.assertEqual({spec.segment for spec in docs.SPECS}, {"retail", "wealth", "commercial"})
        self.assertEqual(
            {spec.folder for spec in docs.SPECS},
            {"01_Onboarding", "02_Relationship_Review", "03_Service_and_Retention"},
        )

    def test_document_names_are_unique_pdfs(self) -> None:
        file_names = [spec.file_name for spec in docs.SPECS]
        self.assertEqual(len(file_names), len(set(file_names)))
        for name in file_names:
            self.assertTrue(name.startswith("Cumulus_"))
            self.assertTrue(name.endswith(".pdf"))

    def test_specs_have_generation_inputs(self) -> None:
        for spec in docs.SPECS:
            self.assertGreaterEqual(len(spec.highlights), 4, spec.title)
            self.assertGreaterEqual(len(spec.metrics), 3, spec.title)
            self.assertGreaterEqual(len(spec.action_rows), 3, spec.title)
            self.assertGreaterEqual(len(spec.source_rows), 3, spec.title)
            self.assertGreaterEqual(len(spec.controls), 3, spec.title)


class KycDocumentTests(unittest.TestCase):
    def test_kyc_file_name_uses_account_id_and_date(self) -> None:
        run_date = kyc.datetime.strptime("2026-05-29", "%Y-%m-%d").date()
        self.assertEqual(
            kyc.kyc_file_name("001000000000001AAA", run_date),
            "001000000000001AAA_KYC_2026-05-29.pdf",
        )

    def test_generated_profile_is_deterministic(self) -> None:
        account = {
            "Id": "001000000000001AAA",
            "Name": "Test Customer",
            "IsPersonAccount": True,
            "BillingCountry": "United States",
        }
        run_date = kyc.datetime.strptime("2026-05-29", "%Y-%m-%d").date()
        first = kyc.generated_profile(account, {}, run_date)
        second = kyc.generated_profile(account, {}, run_date)
        self.assertEqual(first, second)
        self.assertIn(first["risk_rating"], {"Low", "Medium", "High"})

    def test_account_fields_filter_to_existing_describe_fields(self) -> None:
        describe = {
            "fields": [
                {"name": "Id", "label": "Account ID", "type": "id"},
                {"name": "Name", "label": "Account Name", "type": "string"},
                {"name": "Industry", "label": "Industry", "type": "picklist"},
            ]
        }
        fields, labels = kyc.account_fields(describe, include_all_fields=False)
        self.assertEqual(fields, ["Id", "Name", "Industry"])
        self.assertEqual(labels["Industry"], "Industry")


class ArticlesOfIncorporationTests(unittest.TestCase):
    def test_articles_file_name_uses_account_id_and_date(self) -> None:
        run_date = articles.datetime.strptime("2026-05-29", "%Y-%m-%d").date()
        self.assertEqual(
            articles.articles_file_name("001000000000001AAA", run_date),
            "001000000000001AAA_Articles_of_Incorporation_2026-05-29.pdf",
        )

    def test_articles_query_is_business_account_only(self) -> None:
        where = articles.build_where_clause(["001000000000001AAA"], "BillingState = 'NY'")
        self.assertIn("IsPersonAccount = false", where)
        self.assertIn("Id IN ('001000000000001AAA')", where)
        self.assertIn("(BillingState = 'NY')", where)

    def test_generated_articles_profile_is_deterministic(self) -> None:
        account = {
            "Id": "001000000000001AAA",
            "Name": "Summit Manufacturing",
            "IsPersonAccount": False,
            "BillingState": "NY",
            "Industry": "Manufacturing",
        }
        run_date = articles.datetime.strptime("2026-05-29", "%Y-%m-%d").date()
        first = articles.generated_articles_profile(account, run_date)
        second = articles.generated_articles_profile(account, run_date)
        self.assertEqual(first, second)
        self.assertEqual(first["legal_name"], "Summit Manufacturing, Inc.")
        self.assertEqual(first["jurisdiction"], "New York")


if __name__ == "__main__":
    unittest.main()
