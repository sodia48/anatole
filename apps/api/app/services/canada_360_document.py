"""Bounded, ephemeral text extraction for a user-supplied PDF."""

from __future__ import annotations

import base64
import binascii
import io

from pypdf import PdfReader

PDF_MAX_BYTES = 2 * 1024 * 1024
PDF_MAX_PAGES = 10
PDF_MAX_TEXT_CHARS = 6000


class DocumentValidationError(ValueError):
    pass


def extract_pdf_text(encoded: str) -> str:
    if len(encoded) > ((PDF_MAX_BYTES + 2) // 3) * 4:
        raise DocumentValidationError("pdf_too_large")
    try:
        content = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise DocumentValidationError("invalid_pdf") from exc
    if not content.startswith(b"%PDF-"):
        raise DocumentValidationError("invalid_pdf")
    if len(content) > PDF_MAX_BYTES:
        raise DocumentValidationError("pdf_too_large")

    try:
        reader = PdfReader(io.BytesIO(content), strict=False)
        if reader.is_encrypted:
            raise DocumentValidationError("encrypted_pdf")
        if len(reader.pages) > PDF_MAX_PAGES:
            raise DocumentValidationError("too_many_pages")

        parts: list[str] = []
        remaining = PDF_MAX_TEXT_CHARS
        for page in reader.pages:
            if remaining <= 0:
                break
            text = (page.extract_text() or "").strip()
            if text:
                excerpt = text[:remaining]
                parts.append(excerpt)
                remaining -= len(excerpt)
    except DocumentValidationError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise DocumentValidationError("invalid_pdf") from exc

    extracted = "\n\n".join(parts).strip()
    if not extracted:
        raise DocumentValidationError("no_extractable_text")
    return extracted
