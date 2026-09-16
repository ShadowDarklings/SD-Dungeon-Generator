"""Run once with a schema-owner database URL, never with the web application's role."""
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["SD_SKIP_DB_BOOTSTRAP"] = "1"
from app import bootstrap_database, engine
from sqlalchemy import text

bootstrap_database()
if engine.dialect.name == "postgresql":
    with engine.begin() as connection:
        connection.execute(text("REVOKE CREATE ON SCHEMA public FROM PUBLIC"))
        connection.execute(text("GRANT USAGE ON SCHEMA public TO sd_app"))
        connection.execute(text("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sd_app"))
        connection.execute(text("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sd_app"))
        connection.execute(text("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sd_app"))
        connection.execute(text("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sd_app"))
print("Database migration completed.")
