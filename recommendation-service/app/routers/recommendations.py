from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.pgvector_service import PgVectorService
from app.embedding_service import get_embedding_service
from app.keyword_search_service import KeywordSearchService
from app.tfidf_service import TFIDFService

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.post("/search", response_model=schemas.RecommendationResponse)
def search_partners(
    request: schemas.RecommendationRequest,
    db: Session = Depends(get_db)
):
    """
    Search for partners based on a natural language query.
    
    The query is embedded and compared against partner embeddings stored in PostgreSQL using pgvector.
    Returns the top N most similar partners.
    """
    if request.top_n <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="top_n must be greater than 0"
        )
    
    # Embed the query
    query_embedding = get_embedding_service().embed_single(request.query)
    
    # Search using pgvector
    pgvector_service = PgVectorService(db)
    search_results = pgvector_service.search_similar(query_embedding, top_k=request.top_n)
    
    if not search_results:
        return schemas.RecommendationResponse(
            query=request.query,
            results=[]
        )
    
    # Fetch partner details from PostgreSQL
    partner_ids = [result["partner_id"] for result in search_results]
    partners = db.query(models.Partner).filter(models.Partner.id.in_(partner_ids)).all()
    
    # Create a mapping for quick lookup
    partner_map = {partner.id: partner for partner in partners}
    
    # Build results with scores
    results = []
    for search_result in search_results:
        partner_id = search_result["partner_id"]
        if partner_id in partner_map:
            results.append(schemas.RecommendationResult(
                partner=schemas.PartnerResponse.model_validate(partner_map[partner_id]),
                score=search_result["score"]
            ))
    
    return schemas.RecommendationResponse(
        query=request.query,
        results=results
    )


@router.post("/search-keywords", response_model=schemas.RecommendationResponse)
def search_partners_keywords(
    request: schemas.RecommendationRequest,
    db: Session = Depends(get_db)
):
    """
    Search for partners using keyword matching (traditional text search).
    
    The query is split into keywords and searched across all partner fields:
    - name, description, industry, location, website, contact_email, contact_phone, additional_data
    
    Uses OR behavior - matches if any keyword is found in any field.
    Similar to traditional document database searches (e.g., Elasticsearch).
    Returns the top N most relevant partners based on keyword matches.
    """
    if request.top_n <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="top_n must be greater than 0"
        )
    
    # Search using keyword matching
    keyword_service = KeywordSearchService(db)
    search_results = keyword_service.search_keywords(request.query, top_n=request.top_n)
    
    if not search_results:
        return schemas.RecommendationResponse(
            query=request.query,
            results=[]
        )
    
    # Fetch partner details from PostgreSQL
    partner_ids = [result["partner_id"] for result in search_results]
    partners = db.query(models.Partner).filter(models.Partner.id.in_(partner_ids)).all()
    
    # Create a mapping for quick lookup
    partner_map = {partner.id: partner for partner in partners}
    
    # Build results with scores (maintain order from search_results)
    results = []
    for search_result in search_results:
        partner_id = search_result["partner_id"]
        if partner_id in partner_map:
            results.append(schemas.RecommendationResult(
                partner=schemas.PartnerResponse.model_validate(partner_map[partner_id]),
                score=search_result["score"]
            ))
    
    return schemas.RecommendationResponse(
        query=request.query,
        results=results
    )


@router.post("/search-tfidf", response_model=schemas.RecommendationResponse)
def search_partners_tfidf(
    request: schemas.RecommendationRequest,
    db: Session = Depends(get_db)
):
    """
    Search for partners using TF-IDF (Term Frequency-Inverse Document Frequency) scoring.
    
    Uses PostgreSQL's full-text search with TF-IDF-like ranking:
    - Term Frequency: How often query terms appear in partner documents
    - Inverse Document Frequency: How rare/common terms are across all partners
    - Field weights: name and industry (weight A) > description (weight B) > location/website (weight C) > contact info (weight D)
    
    This provides interpretable, relevance-based scoring similar to traditional search engines.
    More efficient than embedding search and provides better keyword matching than simple keyword search.
    """
    if request.top_n <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="top_n must be greater than 0"
        )
    
    # Search using TF-IDF
    tfidf_service = TFIDFService(db)
    search_results = tfidf_service.search_tfidf(request.query, top_n=request.top_n)
    
    if not search_results:
        return schemas.RecommendationResponse(
            query=request.query,
            results=[]
        )
    
    # Fetch partner details from PostgreSQL
    partner_ids = [result["partner_id"] for result in search_results]
    partners = db.query(models.Partner).filter(models.Partner.id.in_(partner_ids)).all()
    
    # Create a mapping for quick lookup
    partner_map = {partner.id: partner for partner in partners}
    
    # Build results with scores (maintain order from search_results)
    results = []
    for search_result in search_results:
        partner_id = search_result["partner_id"]
        if partner_id in partner_map:
            results.append(schemas.RecommendationResult(
                partner=schemas.PartnerResponse.model_validate(partner_map[partner_id]),
                score=search_result["score"]
            ))
    
    return schemas.RecommendationResponse(
        query=request.query,
        results=results
    )

