from sqlalchemy.orm import Session
from sqlalchemy import or_, func, case, Text
from typing import List, Dict
from app import models
import logging

logger = logging.getLogger(__name__)


class KeywordSearchService:
    """Service for keyword-based search across partner fields (OR behavior)"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def search_keywords(self, query: str, top_n: int = 5) -> List[Dict]:
        """
        Search for partners using keyword matching across all fields.
        
        Uses OR behavior - matches if any keyword is found in any field.
        Case-insensitive search across:
        - name
        - description
        - industry
        - location
        - website
        - contact_email
        - contact_phone
        - additional_data (JSON fields)
        
        Args:
            query: Search query string (will be split into keywords)
            top_n: Number of results to return
            
        Returns:
            List of dictionaries with partner_id and score
        """
        # Split query into keywords (remove empty strings)
        keywords = [kw.strip() for kw in query.split() if kw.strip()]
        
        if not keywords:
            return []
        
        # Build OR conditions for each keyword across all text fields
        conditions = []
        for keyword in keywords:
            keyword_pattern = f"%{keyword}%"
            keyword_conditions = [
                models.Partner.name.ilike(keyword_pattern),
                models.Partner.description.ilike(keyword_pattern),
                models.Partner.industry.ilike(keyword_pattern),
                models.Partner.location.ilike(keyword_pattern),
                models.Partner.website.ilike(keyword_pattern),
                models.Partner.contact_email.ilike(keyword_pattern),
                models.Partner.contact_phone.ilike(keyword_pattern),
            ]
            
            # Search in additional_data JSON fields
            # PostgreSQL JSONB text search - check if any value contains the keyword
            keyword_conditions.append(
                func.cast(models.Partner.additional_data, Text).ilike(keyword_pattern)
            )
            
            # OR condition: this keyword matches if it's found in ANY field
            conditions.append(or_(*keyword_conditions))
        
        # Overall OR: match if ANY keyword matches in ANY field
        overall_condition = or_(*conditions)
        
        try:
            # First, get all matching partners
            partners = self.db.query(models.Partner).filter(overall_condition).all()
            
            if not partners:
                return []
            
            # Calculate relevance score for each partner
            # Score based on: number of keywords matched and field importance
            formatted_results = []
            for partner in partners:
                score = 0.0
                
                for keyword in keywords:
                    keyword_lower = keyword.lower()
                    
                    # Field weights: name and industry are most important
                    if partner.name and keyword_lower in partner.name.lower():
                        score += 1.0
                    if partner.industry and keyword_lower in partner.industry.lower():
                        score += 0.9
                    if partner.description and keyword_lower in partner.description.lower():
                        score += 0.8
                    if partner.location and keyword_lower in partner.location.lower():
                        score += 0.7
                    if partner.website and keyword_lower in partner.website.lower():
                        score += 0.6
                    if partner.contact_email and keyword_lower in partner.contact_email.lower():
                        score += 0.5
                    if partner.contact_phone and keyword_lower in partner.contact_phone.lower():
                        score += 0.5
                    
                    # Search in additional_data JSON
                    if partner.additional_data:
                        for value in partner.additional_data.values():
                            if keyword_lower in str(value).lower():
                                score += 0.4
                                break  # Count once per keyword per partner
                
                formatted_results.append({
                    "partner_id": partner.id,
                    "score": score
                })
            
            # Sort by score descending and limit results
            formatted_results.sort(key=lambda x: x["score"], reverse=True)
            return formatted_results[:top_n]
            
        except Exception as e:
            logger.error(f"Keyword search failed: {e}")
            raise
