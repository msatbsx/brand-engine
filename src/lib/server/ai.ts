import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import type { BrandDocument } from './loadDocuments.js';

const anthropic = createAnthropic({
	apiKey: ANTHROPIC_API_KEY
});

const SYSTEM_PROMPT = `You are a brand guidelines assistant.

You answer questions using ONLY the brand documents provided below.

Rules:
1. Never invent information, colours, tone guidance, logo rules, or claims.
2. If the answer cannot be found in the documents, say clearly: "I could not find guidance on this in the current brand guidelines." Then suggest what type of document should be created to cover it.
3. Every answer must cite the source document filenames.
4. If multiple documents support the answer, cite all of them.
5. Provide a confidence level: High, Medium, or Low.
   - High: the documents directly and clearly answer the question.
   - Medium: the documents partially address it or require reasonable inference.
   - Low: the answer is a stretch from what the documents say.

Output format — always use this exact structure:

Confidence: <High | Medium | Low>

Answer:
<your answer here>

Sources:
- <filename>
- <filename>

Evidence:
<one or two direct quotes from the documents that support your answer>`;

function buildDocumentContext(docs: BrandDocument[]): string {
	return docs
		.map(
			(doc) => `<Document>
Filename: ${doc.filename}

Content:
${doc.content}
</Document>`
		)
		.join('\n\n');
}

export function queryBrandDocuments(question: string, docs: BrandDocument[]) {
	const documentContext = buildDocumentContext(docs);

	return streamText({
		model: anthropic('claude-sonnet-4-6'),
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: 'user',
				content: `Brand documents:\n\n${documentContext}\n\n---\n\nQuestion: ${question}`
			}
		],
		maxOutputTokens: 1024
	});
}
