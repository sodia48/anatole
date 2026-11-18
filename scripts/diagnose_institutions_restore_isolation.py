"""Check whether the existing staging cluster can isolate a production restore.

This diagnostic does not create objects or read account rows. It prints only
booleans and storage size, never connection strings or role names.
"""

from __future__ import annotations

import json
import os
from urllib.parse import unquote, urlsplit

import psycopg


def _parts(env_name: str):
    value = os.environ.get(env_name, "")
    if not value:
        raise RuntimeError(f"{env_name} is not configured")
    return urlsplit(value.replace("postgresql+psycopg://", "postgresql://", 1))


def main() -> None:
    stage = _parts("STAGING_DATABASE_URL")
    app = _parts("STAGING_APP_DATABASE_URL")
    if not stage.hostname or not app.hostname or not stage.username or not app.username:
        raise RuntimeError("Staging connection metadata is incomplete")

    same_target = (
        stage.hostname == app.hostname
        and (stage.port or 5432) == (app.port or 5432)
        and stage.path == app.path
    )
    app_role = unquote(app.username)

    stage_url = os.environ["STAGING_DATABASE_URL"].replace(
        "postgresql+psycopg://", "postgresql://", 1
    )
    with psycopg.connect(stage_url, connect_timeout=10) as conn:
        conn.execute("SET TRANSACTION READ ONLY")
        with conn.cursor() as cur:
            cur.execute(
                "SELECT current_user, pg_database_size(current_database())"
            )
            owner_role, database_bytes = cur.fetchone()
            cur.execute(
                "SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = %s",
                (owner_role,),
            )
            owner_flags = cur.fetchone()
            cur.execute(
                "SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = %s",
                (app_role,),
            )
            app_flags = cur.fetchone()
            if app_flags:
                cur.execute(
                    "SELECT pg_has_role(%s, %s, 'MEMBER')",
                    (app_role, owner_role),
                )
                app_member_of_owner = cur.fetchone()[0]
            else:
                app_member_of_owner = False

    role_separation_candidate = bool(
        same_target
        and owner_flags
        and owner_flags[2]
        and app_flags
        and app_role != owner_role
        and not any(app_flags)
        and not app_member_of_owner
    )
    print(
        json.dumps(
            {
                "same_database_target": same_target,
                "app_uses_owner_role": app_role == owner_role,
                "app_role_elevated": bool(app_flags and any(app_flags)),
                "app_member_of_owner": bool(app_member_of_owner),
                "owner_can_create_database": bool(owner_flags and owner_flags[2]),
                "staging_database_bytes": database_bytes,
                "role_separation_candidate": role_separation_candidate,
                "restoration_performed": False,
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
