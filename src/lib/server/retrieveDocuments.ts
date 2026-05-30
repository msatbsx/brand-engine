import { loadDocuments, type BrandDocument } from './loadDocuments.js';

// Returns all brand documents for the current PoC.
// Replace this function with keyword search, embeddings, or vector retrieval
// when a proper RAG layer is needed — the API route and AI layer won't need to change.
export function retrieveDocuments(_query: string): BrandDocument[] {
	return loadDocuments();
}
