from __future__ import annotations

import base64
import io

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.main import app
from app.schemas.canada_360 import Canada360AssistantResponse
from app.services import canada_360_assistant as assistant_module
from app.services.canada_360_assistant import canada_360_assistant_service
from app.services.canada_360_document import (
    PDF_MAX_BYTES,
    DocumentValidationError,
    extract_pdf_text,
)


def sample_pdf(text: str = "CRA notice: check the payment date.") -> bytes:
    content = f"BT /F1 12 Tf 20 250 Td ({text}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n"
        + content + b"\nendstream",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    )
    return bytes(output)


def test_pdf_extraction_accepts_bounded_text_and_rejects_invalid_files() -> None:
    encoded = base64.b64encode(sample_pdf()).decode()
    assert "CRA notice" in extract_pdf_text(encoded)
    with pytest.raises(DocumentValidationError, match="invalid_pdf"):
        extract_pdf_text(base64.b64encode(b"not a pdf").decode())
    with pytest.raises(DocumentValidationError, match="pdf_too_large"):
        extract_pdf_text(base64.b64encode(b"%PDF-" + b"a" * PDF_MAX_BYTES).decode())

    writer = PdfWriter()
    for _ in range(11):
        writer.add_blank_page(width=300, height=300)
    too_many_pages = io.BytesIO()
    writer.write(too_many_pages)
    with pytest.raises(DocumentValidationError, match="too_many_pages"):
        extract_pdf_text(base64.b64encode(too_many_pages.getvalue()).decode())

    encrypted = PdfWriter()
    encrypted.add_blank_page(width=300, height=300)
    encrypted.encrypt("password")
    encrypted_pdf = io.BytesIO()
    encrypted.write(encrypted_pdf)
    with pytest.raises(DocumentValidationError, match="encrypted_pdf"):
        extract_pdf_text(base64.b64encode(encrypted_pdf.getvalue()).decode())


def test_document_route_passes_extracted_text_without_returning_pdf(
    monkeypatch,
) -> None:
    seen = {}

    async def fake_answer(**kwargs):
        seen.update(kwargs)
        return Canada360AssistantResponse(
            answer="This notice mentions a payment date.", jurisdiction="CA",
        )

    monkeypatch.setattr(canada_360_assistant_service, "answer", fake_answer)
    response = TestClient(app).post(
        "/api/v1/canada/assistant/document",
        json={
            "question": "Explique-moi cette lettre de l'ARC.",
            "lang": "fr", "jurisdiction": "CA", "document_consent": True,
            "document_base64": base64.b64encode(sample_pdf()).decode(),
        },
    )
    assert response.status_code == 200
    assert "CRA notice" in seen["document_text"]
    assert "CRA notice" not in response.text


@pytest.mark.asyncio
async def test_document_text_is_not_saved_in_conversation_history(
    monkeypatch,
) -> None:
    seen = {}

    async def fake_grounded(**kwargs):
        seen.update(kwargs)
        return Canada360AssistantResponse(
            answer="La lettre mentionne une date de paiement.", jurisdiction="CA",
        )

    monkeypatch.setattr(assistant_module, "_grounded_model_answer", fake_grounded)
    response = await canada_360_assistant_service.answer(
        question="Explique-moi cette lettre de l'ARC.",
        lang="fr", jurisdiction="CA",
        document_text="PRIVATE PDF CONTENT 12345",
    )
    assert response.intent == "government_document"
    assert seen["document_text"] == "PRIVATE PDF CONTENT 12345"
    assert "PRIVATE PDF CONTENT" not in " ".join(turn.text for turn in response.history)
