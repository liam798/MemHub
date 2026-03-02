import unittest

from pydantic import ValidationError

from app.core.config import settings
from app.schemas.rag import BatchQueryRequest, QueryResponse


class SchemaTests(unittest.TestCase):
    def test_batch_query_request_uses_independent_list_defaults(self):
        req1 = BatchQueryRequest(question="q1")
        req2 = BatchQueryRequest(question="q2")

        req1.kb_ids.append(1)

        self.assertEqual(req1.kb_ids, [1])
        self.assertEqual(req2.kb_ids, [])

    def test_batch_query_request_top_k_validation(self):
        with self.assertRaises(ValidationError):
            BatchQueryRequest(question="q", top_k=0)
        with self.assertRaises(ValidationError):
            BatchQueryRequest(question="q", top_k=settings.RAG_TOP_K_MAX + 1)

    def test_query_response_uses_independent_source_defaults(self):
        r1 = QueryResponse(answer="a1")
        r2 = QueryResponse(answer="a2")

        r1.sources.append({"content": "x"})

        self.assertEqual(r1.sources, [{"content": "x"}])
        self.assertEqual(r2.sources, [])


if __name__ == "__main__":
    unittest.main()
