from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models, schemas
from app.embedding_service import get_embedding_service

router = APIRouter(prefix="/partners", tags=["partners"])


@router.post("/", response_model=schemas.PartnerResponse, status_code=status.HTTP_201_CREATED)
def create_partner(partner: schemas.PartnerCreate, db: Session = Depends(get_db)):
    """Create a new partner with embedding in a single transaction"""
    db_partner = models.Partner(**partner.model_dump())
    
    # Generate embedding before committing
    partner_string = db_partner.to_string()
    embedding = get_embedding_service().embed_single(partner_string)
    
    # Set embedding directly on the partner object
    db_partner.embedding = embedding
    
    # Save partner and embedding in a single transaction
    db.add(db_partner)
    db.commit()
    db.refresh(db_partner)
    
    return db_partner


@router.get("/", response_model=List[schemas.PartnerResponse])
def list_partners(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all partners"""
    partners = db.query(models.Partner).offset(skip).limit(limit).all()
    return partners


@router.get("/{partner_id}", response_model=schemas.PartnerResponse)
def get_partner(partner_id: int, db: Session = Depends(get_db)):
    """Get a specific partner by ID"""
    partner = db.query(models.Partner).filter(models.Partner.id == partner_id).first()
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Partner with id {partner_id} not found"
        )
    return partner


@router.put("/{partner_id}", response_model=schemas.PartnerResponse)
def update_partner(
    partner_id: int,
    partner_update: schemas.PartnerUpdate,
    db: Session = Depends(get_db)
):
    """Update a partner with embedding in a single transaction"""
    db_partner = db.query(models.Partner).filter(models.Partner.id == partner_id).first()
    if not db_partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Partner with id {partner_id} not found"
        )
    
    # Update fields
    update_data = partner_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_partner, field, value)
    
    # Regenerate embedding with updated data
    partner_string = db_partner.to_string()
    embedding = get_embedding_service().embed_single(partner_string)
    db_partner.embedding = embedding
    
    # Save partner and embedding in a single transaction
    db.commit()
    db.refresh(db_partner)
    
    return db_partner


@router.delete("/{partner_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_partner(partner_id: int, db: Session = Depends(get_db)):
    """Delete a partner (embedding is automatically deleted with the record)"""
    db_partner = db.query(models.Partner).filter(models.Partner.id == partner_id).first()
    if not db_partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Partner with id {partner_id} not found"
        )
    
    # Delete partner (embedding is part of the same record, so it's deleted automatically)
    db.delete(db_partner)
    db.commit()
    
    return None

