"""Global context aware assistant; legacy workspace endpoint remains available."""

from fastapi import APIRouter

from app.schemas.assistant_context import UnifiedAssistantRequest, UnifiedAssistantResponse
from app.services.anatole_assistant_orchestrator import anatole_assistant_orchestrator


router = APIRouter()


@router.post("/chat", response_model=UnifiedAssistantResponse)
async def chat(request: UnifiedAssistantRequest) -> UnifiedAssistantResponse:
    return await anatole_assistant_orchestrator.answer(request)
