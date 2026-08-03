from __future__ import annotations

import asyncio
import json

from app.services.accounts import account_service
from app.services.notifications import notification_service


async def main() -> None:
    await account_service.start()
    notification_service.account_service = account_service
    await notification_service.start()
    try:
        result = await notification_service.run_due_digests()
        print(json.dumps(result.model_dump(), ensure_ascii=False))
    finally:
        await account_service.close()


if __name__ == "__main__":
    asyncio.run(main())
