import { json } from '@sveltejs/kit';
import { ACTIVE_BRAND } from '$env/static/private';
import { retrieveDocuments } from '$lib/server/retrieveDocuments.js';
import { queryBrandDocuments, type UploadedImage } from '$lib/server/ai.js';
import { requireAccess } from '$lib/server/access.js';
import { logger } from '$lib/server/logger.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export async function POST(event) {
	// TEMPORARY POC ACCESS CONTROL — replace with proper auth/SSO before production use.
	requireAccess(event);

	const { question, images = [] } = await event.request.json();

	if (!question?.trim()) {
		return json({ error: 'Question is required.' }, { status: 400 });
	}

	if (!Array.isArray(images) || images.length > MAX_IMAGES) {
		return json({ error: `Maximum ${MAX_IMAGES} images allowed.` }, { status: 400 });
	}

	for (const img of images) {
		if (!ALLOWED_MIME_TYPES.has(img.mimeType)) {
			return json({ error: `Unsupported image type: ${img.mimeType}` }, { status: 400 });
		}
		const sizeBytes = (img.data.length * 3) / 4;
		if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
			return json({ error: 'Each image must be under 5 MB.' }, { status: 400 });
		}
	}

	logger.question(question, ACTIVE_BRAND, images.length > 0);

	try {
		const docs = retrieveDocuments(question);
		const result = queryBrandDocuments(question, docs, images as UploadedImage[]);
		// Return the SDK's own streaming response directly — no custom wrapping.
		return result.toTextStreamResponse();
	} catch (err) {
		logger.error('chat_api_error', { brand: ACTIVE_BRAND, question, error: String(err) });
		console.error('Chat API error:', err);
		return json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
	}
}
