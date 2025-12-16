from sentence_transformers import SentenceTransformer
from app.config import settings
import numpy as np
from typing import List, Union
import logging

logger = logging.getLogger(__name__)


class EmbeddingService:
    _instance = None
    _model = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingService, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            try:
                logger.info(f"Loading embedding model: {settings.embedding_model}")
                self._model = SentenceTransformer(settings.embedding_model)
                self._initialized = True
                logger.info("Embedding model loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load embedding model: {e}")
                raise
    
    def embed(self, text: Union[str, List[str]]) -> np.ndarray:
        """
        Generate embeddings for text or list of texts
        
        Args:
            text: Single string or list of strings to embed
            
        Returns:
            numpy array of embeddings (shape: (1, dim) for single text or (n, dim) for list)
        """
        if isinstance(text, str):
            text = [text]
        
        embeddings = self._model.encode(text, convert_to_numpy=True, show_progress_bar=False)
        return embeddings
    
    def embed_single(self, text: str) -> List[float]:
        """
        Generate embedding for a single text and return as list
        
        Args:
            text: String to embed
            
        Returns:
            List of floats representing the embedding vector
        """
        embedding = self.embed(text)
        return embedding[0].tolist()


# Singleton instance - lazy initialization
embedding_service = None

def get_embedding_service() -> EmbeddingService:
    """Get or create embedding service instance"""
    global embedding_service
    if embedding_service is None:
        embedding_service = EmbeddingService()
    return embedding_service

