# Partner Recommendation Service

A FastAPI-based recommendation system that uses embeddings to find similar partners based on natural language queries.

## Features

- **Partner Management**: CRUD operations for managing partner data in PostgreSQL
- **Vector Search**: Semantic search using PostgreSQL with pgvector extension
- **Embeddings**: Uses `mixedbread-ai/mxbai-embed-large-v1` model for generating embeddings
- **Natural Language Queries**: Search partners using plain English queries
- **Single Database**: All data (relational and vector) stored in PostgreSQL for simplicity

## Architecture

- **PostgreSQL with pgvector**: Stores both partner information and embeddings in a single database
- **Embedding Model**: `mixedbread-ai/mxbai-embed-large-v1` (1024 dimensions)
- **HNSW Index**: Efficient vector similarity search using cosine distance

## Setup

### Prerequisites

- Python 3.9+
- [uv](https://github.com/astral-sh/uv) (fast Python package installer and resolver)
- Docker and Docker Compose (for PostgreSQL with pgvector)

### Installation

1. **Install uv** (if not already installed):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
# Or on Windows: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

2. **Start infrastructure services** (PostgreSQL with pgvector):

```bash
cd ..
docker-compose up -d postgres
```

3. **Install dependencies using uv**:

```bash
cd recommendation-service
uv sync --no-install-project
```

This will create a virtual environment and install all dependencies from `pyproject.toml` without trying to build the application as a package.

4. **Configure environment**:

```bash
cp .env.example .env
# Edit .env with your settings if needed
```

5. **Run the application**:

```bash
# Using uv to run the app:
uv run python -m app.main
# Or using uvicorn directly:
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API Endpoints

### Partners

- `POST /partners/` - Create a new partner
- `GET /partners/` - List all partners
- `GET /partners/{partner_id}` - Get a specific partner
- `PUT /partners/{partner_id}` - Update a partner
- `DELETE /partners/{partner_id}` - Delete a partner

### Recommendations

- `POST /recommendations/search` - Search for partners using natural language query

### Example Search Request

```json
{
  "query": "I'm looking for a fintech company in San Francisco that specializes in payment processing",
  "top_n": 5
}
```

## How It Works

1. **Partner Creation/Update**: When a partner is created or updated:
   - All partner fields are stringified
   - The stringified data is passed through the embedding model to generate an embedding
   - Partner data and embedding are saved together in a single PostgreSQL transaction using pgvector
   - This ensures data consistency and atomicity

2. **Search/Recommendation**: When searching:
   - The natural language query is embedded using the same model
   - The query embedding is compared against all partner embeddings in PostgreSQL using cosine similarity
   - Top N most similar partners are retrieved using the HNSW index
   - Full partner details are returned with similarity scores
   - All data comes from a single database query - no need to join across databases

## Environment Variables

- `POSTGRES_HOST` - PostgreSQL host (default: localhost)
- `POSTGRES_PORT` - PostgreSQL port (default: 5432)
- `POSTGRES_USER` - PostgreSQL user (default: postgres)
- `POSTGRES_PASSWORD` - PostgreSQL password (default: postgres)
- `POSTGRES_DB` - PostgreSQL database name (default: partners_db)
- `EMBEDDING_MODEL` - Embedding model name (default: mixedbread-ai/mxbai-embed-large-v1)
- `API_PORT` - API server port (default: 8000)
- `API_HOST` - API server host (default: 0.0.0.0)

## Benefits of PostgreSQL + pgvector

- **Simplified Architecture**: Single database for all data (relational + vector)
- **ACID Transactions**: Can combine relational and vector operations in transactions
- **Reduced Complexity**: No need for separate vector database (Milvus) and its dependencies (etcd, MinIO)
- **Lower Resource Usage**: Fewer containers and services to manage
- **Easier Maintenance**: Single database to backup, monitor, and maintain
- **Good Performance**: pgvector with HNSW index provides excellent performance for millions of vectors

