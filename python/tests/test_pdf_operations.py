from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from pypdf import PdfReader

from pavidffeliz_backend.errors import OperationError, ValidationError
from pavidffeliz_backend.operations.pdf_structure import (
    delete_pdf_pages,
    lock_pdf,
    merge_pdfs,
    parse_page_ranges,
    reorder_pdf,
    split_pdf_by_ranges,
    split_pdf_every_n_pages,
    split_pdf_individual_pages,
    unlock_pdf,
)
from helpers import create_blank_pdf, pdf_page_count, pdf_page_widths


class PdfOperationTests(unittest.TestCase):
    def test_parse_page_ranges_accepts_string_and_lists(self) -> None:
        ranges = parse_page_ranges("1-2, 4", 5)

        self.assertEqual([item.label for item in ranges], ["1-2", "4"])
        self.assertEqual([item.pages for item in ranges], [(1, 2), (4,)])
        self.assertEqual(parse_page_ranges([1, "3-4"], 4)[1].pages, (3, 4))

    def test_parse_page_ranges_rejects_out_of_range_pages(self) -> None:
        with self.assertRaises(ValidationError):
            parse_page_ranges("1-6", 5)

    def test_merge_pdfs_combines_pages_and_preserves_inputs(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = create_blank_pdf(root / "first.pdf", [(100, 100), (110, 100)])
            second = create_blank_pdf(root / "second.pdf", [(120, 100)])
            before = first.read_bytes()
            output = root / "merged.pdf"

            result = merge_pdfs([first, second], output)

            self.assertEqual(result["operation"], "pdf.merge")
            self.assertEqual(result["page_count"], 3)
            self.assertEqual(pdf_page_count(output), 3)
            self.assertEqual(first.read_bytes(), before)

    def test_split_pdf_by_ranges_writes_requested_outputs(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(100, 100), (110, 100), (120, 100), (130, 100)])

            result = split_pdf_by_ranges(source, root / "out", "1-2,4")

            self.assertEqual(result["operation"], "pdf.split_ranges")
            self.assertEqual(len(result["output_paths"]), 2)
            self.assertEqual([pdf_page_count(Path(path)) for path in result["output_paths"]], [2, 1])

    def test_split_pdf_every_n_pages_chunks_document(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(100 + page, 100) for page in range(5)])

            result = split_pdf_every_n_pages(source, root / "out", 2)

            self.assertEqual(result["operation"], "pdf.split_every_n")
            self.assertEqual(result["pages_per_file"], 2)
            self.assertEqual([pdf_page_count(Path(path)) for path in result["output_paths"]], [2, 2, 1])

    def test_split_pdf_individual_pages_writes_one_file_per_page(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(100, 100), (110, 100), (120, 100)])

            result = split_pdf_individual_pages(source, root / "out")

            self.assertEqual(result["operation"], "pdf.split_individual")
            self.assertEqual(len(result["output_paths"]), 3)
            self.assertTrue(all(pdf_page_count(Path(path)) == 1 for path in result["output_paths"]))

    def test_reorder_pdf_requires_full_permutation_and_changes_order(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(100, 100), (200, 100), (300, 100)])
            output = root / "reordered.pdf"

            result = reorder_pdf(source, output, [3, 1, 2])

            self.assertEqual(result["operation"], "pdf.reorder")
            self.assertEqual(pdf_page_widths(output), [300, 100, 200])

            with self.assertRaises(ValidationError):
                reorder_pdf(source, root / "bad.pdf", [1, 1, 2])

    def test_delete_pdf_pages_keeps_remaining_pages(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(100, 100), (200, 100), (300, 100), (400, 100)])
            output = root / "deleted.pdf"

            result = delete_pdf_pages(source, output, "2,4")

            self.assertEqual(result["operation"], "pdf.delete_pages")
            self.assertEqual(result["deleted_pages"], [2, 4])
            self.assertEqual(pdf_page_widths(output), [100, 300])

    def test_delete_pdf_pages_rejects_deleting_every_page(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(100, 100)])

            with self.assertRaises(ValidationError):
                delete_pdf_pages(source, root / "empty.pdf", "1")

    def test_lock_and_unlock_pdf_uses_aes_128(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(100, 100), (120, 100)])
            locked = root / "locked.pdf"
            unlocked = root / "unlocked.pdf"

            lock_result = lock_pdf(source, locked, "secret")

            self.assertEqual(lock_result["encryption"]["algorithm"], "AES-128")
            locked_reader = PdfReader(str(locked))
            self.assertTrue(locked_reader.is_encrypted)
            self.assertNotEqual(locked_reader.decrypt("secret"), 0)
            self.assertEqual(len(locked_reader.pages), 2)

            unlock_result = unlock_pdf(locked, unlocked, "secret")

            self.assertFalse(PdfReader(str(unlocked)).is_encrypted)
            self.assertEqual(unlock_result["page_count"], 2)
            self.assertEqual(pdf_page_count(unlocked), 2)

    def test_unlock_pdf_rejects_wrong_password(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = create_blank_pdf(root / "source.pdf", [(100, 100)])
            locked = root / "locked.pdf"
            lock_pdf(source, locked, "secret")

            with self.assertRaises(OperationError):
                unlock_pdf(locked, root / "unlocked.pdf", "wrong")


if __name__ == "__main__":
    unittest.main()
