from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict
from app import models
import logging
import re

logger = logging.getLogger(__name__)


class TFIDFService:
    """Efficient TF-IDF search service using PostgreSQL full-text search"""
    
    def __init__(self, db: Session):
        self.db = db
        self._ensure_fulltext_index()
    
    def _ensure_fulltext_index(self):
        """Create full-text search index and trigger for automatic updates"""
        try:
            # Create a generated column for searchable text (if it doesn't exist)
            # This combines all searchable fields into one tsvector
            self.db.execute(text("""
                DO $$
                BEGIN
                    -- Add searchable_text column if it doesn't exist
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'partners' AND column_name = 'searchable_text'
                    ) THEN
                        ALTER TABLE partners 
                        ADD COLUMN searchable_text tsvector 
                        GENERATED ALWAYS AS (
                            setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
                            setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
                            setweight(to_tsvector('english', COALESCE(industry, '')), 'A') ||
                            setweight(to_tsvector('english', COALESCE(location, '')), 'C') ||
                            setweight(to_tsvector('english', COALESCE(website, '')), 'C') ||
                            setweight(to_tsvector('english', COALESCE(contact_email, '')), 'D') ||
                            setweight(to_tsvector('english', COALESCE(contact_phone, '')), 'D') ||
                            setweight(to_tsvector('english', COALESCE(additional_data::text, '')), 'C')
                        ) STORED;
                    END IF;
                END $$;
            """))
            
            # Create GIN index for fast full-text search
            self.db.execute(text("""
                CREATE INDEX IF NOT EXISTS partners_searchable_text_idx 
                ON partners 
                USING GIN (searchable_text);
            """))
            
            self.db.commit()
            logger.info("Full-text search index created/verified")
        except Exception as e:
            logger.warning(f"Full-text index creation check failed (may already exist): {e}")
            self.db.rollback()
    
    def _prepare_query(self, query: str) -> str:
        """
        Prepare query string for PostgreSQL tsquery.
        Converts user query into proper tsquery format with OR behavior.
        """
        # Split into keywords and clean them
        keywords = [kw.strip() for kw in query.split() if kw.strip()]
        
        if not keywords:
            return ""
        
        # Escape special characters and create OR query
        # PostgreSQL tsquery uses | for OR
        escaped_keywords = []
        for keyword in keywords:
            # Remove special tsquery characters and escape
            cleaned = re.sub(r'[&|!():]', '', keyword)
            if cleaned:
                # Use prefix matching for better recall
                escaped_keywords.append(f"{cleaned}:*")
        
        if not escaped_keywords:
            return ""
        
        # Join with OR operator
        return " | ".join(escaped_keywords)
    
    def search_tfidf(self, query: str, top_n: int = 5) -> List[Dict]:
        """
        Search for partners using TF-IDF scoring via PostgreSQL full-text search.
        
        Uses PostgreSQL's ts_rank_cd which implements TF-IDF-like scoring:
        - Term Frequency (TF): How often terms appear in the document
        - Inverse Document Frequency (IDF): How rare/common terms are across all documents
        
        Args:
            query: Search query string
            top_n: Number of results to return
            
        Returns:
            List of dictionaries with partner_id and score
        """
        # Prepare query for PostgreSQL tsquery
        tsquery = self._prepare_query(query)
        
        if not tsquery:
            return []
        
        try:
            # Use PostgreSQL's full-text search with TF-IDF-like ranking
            # ts_rank_cd uses cover density ranking (better than ts_rank)
            # We use normalized ranking [0, 1] for consistency
            sql_query = text("""
                SELECT 
                    id,
                    ts_rank_cd(
                        searchable_text,
                        to_tsquery('english', :query),
                        32  -- normalization: divide by document length
                    ) as score
                FROM partners
                WHERE searchable_text @@ to_tsquery('english', :query)
                ORDER BY score DESC
                LIMIT :limit
            """)
            
            result = self.db.execute(
                sql_query,
                {"query": tsquery, "limit": top_n}
            )
            
            formatted_results = []
            for row in result:
                formatted_results.append({
                    "partner_id": row.id,
                    "score": float(row.score) if row.score else 0.0
                })
            
            return formatted_results
            
        except Exception as e:
            logger.error(f"TF-IDF search failed: {e}")
            # Fallback: if searchable_text column doesn't exist yet, use simple text search
            try:
                logger.warning("Falling back to simple text search - full-text index may not be ready")
                return self._fallback_search(query, top_n)
            except Exception as e2:
                logger.error(f"Fallback search also failed: {e2}")
                raise
    
    def _fallback_search(self, query: str, top_n: int) -> List[Dict]:
        """Fallback search if full-text index is not available"""
        keywords = [kw.strip() for kw in query.split() if kw.strip()]
        if not keywords:
            return []
        
        # Simple keyword matching as fallback
        from sqlalchemy import or_
        conditions = []
        for keyword in keywords:
            keyword_pattern = f"%{keyword}%"
            conditions.append(
                or_(
                    models.Partner.name.ilike(keyword_pattern),
                    models.Partner.description.ilike(keyword_pattern),
                    models.Partner.industry.ilike(keyword_pattern),
                    models.Partner.location.ilike(keyword_pattern),
                )
            )
        
        partners = self.db.query(models.Partner).filter(or_(*conditions)).limit(top_n).all()
        
        return [{"partner_id": p.id, "score": 0.5} for p in partners]
