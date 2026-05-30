import { json } from '@sveltejs/kit';
import { retrieveDocuments } from '$lib/server/retrieveDocuments.js';
import { queryBrandDocuments, type UploadedImage } from '$lib/server/ai.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per image (base64 decoded)

export async function POST({ request }) {
	const { question, images = [] } = await request.json();

	if (!question?.trim()) {
		return json({ error: 'Question is required.' }, { status: 400 });
	}

	// Validate images
	if (!Array.isArray(images) || images.length > MAX_IMAGES) {
		return json({ error: `Maximum ${MAX_IMAGES} images allowed.` }, { status: 400 });
	}

	for (const img of images) {
		if (!ALLOWED_MIME_TYPES.has(img.mimeType)) {
			return json({ error: `Unsupported image type: ${img.mimeType}` }, { status: 400 });
		}
		const sizeBytes = (img.data.length * 3) / 4; // approximate decoded size
		if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
			return json({ error: 'Each image must be under 5 MB.' }, { status: 400 });
		}
	}

	try {
		const docs = retrieveDocuments(question);
		const result = queryBrandDocuments(question, docs, images as UploadedImage[]);
		return result.toTextStreamResponse();
	} catch (err) {
		console.error('Chat API error:', err);
		return json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
	}
}
