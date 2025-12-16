from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)

DIMENSION = 1024  # Dimension for mxbai-embed-large-v1 model


class PgVectorService:
    """Service for vector similarity search using pgvector"""
    
    def __init__(self, db: Session):
        self.db = db
        self._ensure_index()
    
    def _ensure_index(self):
        """Create index on embedding column if it doesn't exist"""
        try:
            # Create HNSW index for efficient similarity search
            self.db.execute(text("""
                CREATE INDEX IF NOT EXISTS partners_embedding_idx 
                ON partners 
                USING hnsw (embedding vector_cosine_ops)
            """))
            self.db.commit()
            logger.info("Vector index created/verified")
        except Exception as e:
            logger.warning(f"Index creation check failed (may already exist): {e}")
            self.db.rollback()
    
    def search_similar(self, query_embedding: List[float], top_k: int = 5) -> List[Dict]:
        """
        Search for similar partners using cosine similarity
        
        Args:
            query_embedding: Query embedding vector
            top_k: Number of results to return
            
        Returns:
            List of dictionaries with partner_id and score
        """
        try:
            # Convert list to string format for pgvector
            embedding_str = '[' + ','.join(map(str, query_embedding)) + ']'
            
            # With psycopg3 and SQLAlchemy text(), use :param syntax
            # The type casting ::vector needs to be in the SQL, not the parameter
            query = text("""
                SELECT 
                    id,
                    1 - (embedding <=> CAST(:query_vector AS vector)) as similarity_score,
                    embedding <=> CAST(:query_vector AS vector) as distance
                FROM partners
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> CAST(:query_vector AS vector)
                LIMIT :limit
            """)
            
            result = self.db.execute(
                query,
                {"query_vector": embedding_str, "limit": top_k}
            )
            
            formatted_results = []
            for row in result:
                formatted_results.append({
                    "partner_id": row.id,
                    "distance": float(row.distance),
                    "score": float(row.similarity_score)
                })
            
            return formatted_results
        except Exception as e:
            logger.error(f"Search failed: {e}")
            raise
    

