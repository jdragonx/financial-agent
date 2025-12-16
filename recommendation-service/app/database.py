from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pgvector.psycopg import register_vector
from app.config import settings

engine = create_engine(settings.postgres_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Register pgvector types with psycopg3
@event.listens_for(engine, "connect")
def connect(dbapi_connection, connection_record):
    register_vector(dbapi_connection)

Base = declarative_base()


def ensure_pgvector_extension():
    """Ensure pgvector extension is enabled in the database"""
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
    except Exception as e:
        # Log but don't fail - extension might already exist or DB might not be ready
        import logging
        logging.getLogger(__name__).warning(f"Could not ensure pgvector extension: {e}")


def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

