from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, ensure_pgvector_extension
from app.routers import partners, recommendations
from app.config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create database tables and ensure pgvector extension
try:
    Base.metadata.create_all(bind=engine)
    ensure_pgvector_extension()
except Exception as e:
    logger.warning(f"Database initialization warning: {e}. The app will continue but database features may not work until the database is available.")

app = FastAPI(
    title="Partner Recommendation API",
    description="API for managing partners and finding recommendations using embeddings",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(partners.router)
app.include_router(recommendations.router)


@app.get("/")
def root():
    return {
        "message": "Partner Recommendation API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True
    )


