# Conocimiento / RAG (Fase 7)

Código en `app/modules/knowledge/`.

## Modelo

- **4 PDFs opcionales** por empresa (`guide` | `faq` | `warranty` | `policy`), un documento por tipo (índice único `companyId + type`).
- Todos los planes permiten los 4 (`maxKnowledgeDocs = 4`).

## Pipeline

| Paso       | Archivo         | Detalle                                   |
| ---------- | --------------- | ----------------------------------------- |
| Parseo     | `text.py`       | `pypdf`, solo texto seleccionable         |
| Chunking   | `text.py`       | `RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP`    |
| Embeddings | `embeddings.py` | OpenRouter o mock                         |
| Indexado   | `indexer.py`    | Guarda los fragmentos con su vector       |
| Retrieval  | `retrieval.py`  | pgvector, `RAG_TOP_K`; `format_rag_block` |

El `rag_block` se inyecta en `build_sales_assistant_system_prompt` junto al catálogo (ver [IA](ia.md)).

## API y admin

- Subida: `PUT /knowledge/:type/file` (multipart PDF). Borrado: `DELETE /knowledge/:type`.
- Capacidad `manageKnowledge` (owner + manager).
- Admin: `/knowledge` (entrada "Conocimiento" en el grupo Asistente del sidebar; aviso `KnowledgeHint` en el playground).
- Los documentos **no** bloquean la activación de WhatsApp (ver [prerrequisitos](whatsapp.md#prerrequisitos)): sin fragmentos, el prompt indica no inventar políticas y ofrecer un asesor.

## Configuración

`EMBEDDING_PROVIDER` (`openrouter` | `mock`), `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` (1536), `RAG_TOP_K`, `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`.
