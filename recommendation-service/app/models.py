from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from app.database import Base


class Partner(Base):
    __tablename__ = "partners"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    industry = Column(String(100), nullable=True)
    location = Column(String(255), nullable=True)
    website = Column(String(500), nullable=True)
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    additional_data = Column(JSON, nullable=True)  # For flexible additional fields
    embedding = Column(Vector(1024), nullable=True)  # Embedding vector (1024 dimensions for mxbai-embed-large-v1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def to_string(self) -> str:
        """Convert partner data to string for embedding"""
        parts = [
            f"Name: {self.name}",
            f"Description: {self.description or 'N/A'}",
            f"Industry: {self.industry or 'N/A'}",
            f"Location: {self.location or 'N/A'}",
            f"Website: {self.website or 'N/A'}",
            f"Contact Email: {self.contact_email or 'N/A'}",
            f"Contact Phone: {self.contact_phone or 'N/A'}",
        ]
        
        if self.additional_data:
            for key, value in self.additional_data.items():
                parts.append(f"{key}: {value}")
        
        return "\n".join(parts)

