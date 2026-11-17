"""Reversible Institutions schema migration on ACCOUNT_DATABASE_URL."""

from __future__ import annotations

import argparse

from sqlalchemy import create_engine

from sync_institution_store import normalized_database_url

from app.services.institution_store import InstitutionStore


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("direction", choices=("up", "down"))
    args = parser.parse_args()
    engine = create_engine(normalized_database_url(), pool_pre_ping=True)
    try:
        store = InstitutionStore(engine)
        if args.direction == "up":
            store.create_schema()
        else:
            store.drop_schema()
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
