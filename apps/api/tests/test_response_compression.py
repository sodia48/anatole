from fastapi.middleware.gzip import GZipMiddleware

from app.main import app


def test_api_registers_gzip_middleware() -> None:
    assert any(
        middleware.cls is GZipMiddleware
        for middleware in app.user_middleware
    )
