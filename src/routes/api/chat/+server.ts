import { json } from '@sveltejs/kit';
import { retrieveDocuments } from '$lib/server/retrieveDocuments.js';
import { queryBrandDocuments } from '$lib/server/ai.js';

export async function POST({ request }) {
	const { question } = await request.json();

	if (!question?.trim()) {
		return json({ error: 'Question is required.' }, { status: 400 });
	}

	try {
		const docs = retrieveDocuments(question);
		const result = queryBrandDocuments(question, docs);
		return result.toTextStreamResponse();
	} catch (err) {
		console.error('Chat API error:', err);
		return json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
	}
}
