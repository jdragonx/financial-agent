from pydantic import BaseModel, EmailStr, HttpUrl
from typing import Optional, Dict, Any, List
from datetime import datetime


class PartnerBase(BaseModel):
    name: str
    description: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    additional_data: Optional[Dict[str, Any]] = None


class PartnerCreate(PartnerBase):
    pass


class PartnerUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    additional_data: Optional[Dict[str, Any]] = None


class PartnerResponse(PartnerBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class RecommendationRequest(BaseModel):
    query: str
    top_n: int = 5


class RecommendationResult(BaseModel):
    partner: PartnerResponse
    score: float


class RecommendationResponse(BaseModel):
    query: str
    results: List[RecommendationResult]


