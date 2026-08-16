from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas.provincial_macro import ProvincialMacroSnapshot
from app.services.provincial_macro import PROVINCES, normalize_region, provincial_macro_service

router = APIRouter()


@router.get(
    "/provincial-macro",
    response_model=ProvincialMacroSnapshot,
    summary="Fil macro province-first",
)
async def get_provincial_macro(
    region: str = Query(..., min_length=2, max_length=40),
    lang: str = Query("fr", pattern="^(fr|en)$"),
) -> ProvincialMacroSnapshot:
    code = normalize_region(region)
    if code not in PROVINCES:
        raise HTTPException(
            status_code=422,
            detail=(
                "Province non reconnue. Utiliser QC, ON, BC, AB, SK, MB, NB, NS, PE ou NL."
            ),
        )
    return await provincial_macro_service.get_snapshot(code, lang)
