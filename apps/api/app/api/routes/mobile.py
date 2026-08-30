from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.api.routes import accounts as account_routes
from app.schemas.accounts import AccountUser
from app.schemas.mobile import MobileDevice, MobileDeviceRegisterRequest


router = APIRouter()


@router.post(
    "/devices",
    response_model=MobileDevice,
    status_code=status.HTTP_201_CREATED,
    summary="Enregistre ou actualise un appareil mobile du compte",
)
async def register_device(
    payload: MobileDeviceRegisterRequest,
    user: AccountUser = Depends(account_routes.current_user),
) -> MobileDevice:
    row = await account_routes.account_service.register_mobile_device(
        user_id=user.id,
        push_token=payload.token,
        platform=payload.platform,
        device_name=payload.device_name,
        app_version=payload.app_version,
    )
    return MobileDevice.model_validate(row)


@router.get(
    "/devices",
    response_model=list[MobileDevice],
    summary="Liste les appareils mobiles du compte",
)
async def devices(
    user: AccountUser = Depends(account_routes.current_user),
) -> list[MobileDevice]:
    rows = await account_routes.account_service.list_mobile_devices(user.id)
    return [MobileDevice.model_validate(row) for row in rows]


@router.delete(
    "/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Désenregistre un jeton push de ce compte",
)
async def delete_device(
    device_id: str,
    user: AccountUser = Depends(account_routes.current_user),
) -> None:
    await account_routes.account_service.delete_mobile_device(
        user_id=user.id,
        device_id=device_id,
    )
