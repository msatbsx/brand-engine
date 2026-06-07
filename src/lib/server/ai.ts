import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import type { BrandDocument } from './loadDocuments.js';
import { loadReferenceImages } from './loadReferenceImages.js';

const anthropic = createAnthropic({
	apiKey: ANTHROPIC_API_KEY
});

export interface ImageAnalysis {
	width: number;
	height: number;
	aspectRatio: number;
	logoRegion: { x: number; y: number; w: number; h: number; aspectRatio: number } | null;
}

export interface UploadedImage {
	data: string; // base64, no data-URL prefix
	mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
	analysis?: ImageAnalysis | null;
}

const TEXT_ONLY_SYSTEM_PROMPT = `You are a brand guidelines assistant.

You answer questions using ONLY the brand documents provided.

Rules:
0. Never use emojis or emoticons in your response.
1. Never invent information, colours, tone guidance, logo rules, or claims.
2. If the answer cannot be found in the documents, say so clearly, then suggest what document should be created.
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

Evidence:
<direct quotes from the documents that support your answer. Prefix every quote with its page number using this exact format: [Page N] — e.g. [Page 15] "The Cprime logo must always appear..." You may cite multiple pages.>`;

const IMAGE_REVIEW_SYSTEM_PROMPT = `You are a precise brand compliance reviewer. Your most important skill is detecting geometric distortion in logos.

You receive:
- GROUP A: canonical reference images from the official brand guidelines (ground truth)
- GROUP B: the image(s) submitted for review

Work through every step below in order. Do not skip any check.

---

STEP 1 — DISTORTION CHECKS (answer each with the exact label shown)

For each check, look carefully at both the reference (GROUP A) and the submitted image (GROUP B), then write the exact label that applies.

CHECK 1 — Letter counter shapes
The letters "a", "g", and "e" in "Aagee" each contain enclosed rounded shapes (counters/bowls). In the correct undistorted logo these are approximately circular.
Look at the submitted image. The counters appear:
  → Write "CHECK 1: OK — counters are circular" if they match the reference
  → Write "CHECK 1: FAIL — counters are wider than tall (horizontal stretch)" if they look like horizontal ovals
  → Write "CHECK 1: FAIL — counters are taller than wide (vertical stretch)" if they look like vertical ovals

CHECK 2 — "A" symbol proportions
Brand spec: the "A" symbol is 7.5 units wide × 8.5 units tall — height is greater than width by ~13%.
Important: do not evaluate this in isolation. Look at the reference "A" symbol (GROUP A) and the submitted "A" symbol (GROUP B) side by side. Mentally overlay them.
  → If the submitted "A" looks the same height-to-width ratio as the reference: write "CHECK 2: OK — A symbol is taller than wide"
  → If the submitted "A" appears WIDER relative to its height than the reference "A" (legs splaying out more, overall shape squatter): write "CHECK 2: FAIL — A symbol appears square or wider than tall (horizontal stretch)"
  → If the submitted "A" appears NARROWER relative to its height than the reference: write "CHECK 2: FAIL — A symbol appears more elongated than reference (vertical stretch)"
Do not guess based on the spec number alone — compare visually to the reference image.

CHECK 3 — Full wordmark aspect ratio
Place the reference wordmark (GROUP A) and submitted wordmark (GROUP B) side by side in your mind.
  → If letter widths, spacing, and overall shape look the same: write "CHECK 3: OK — wordmark proportions match reference"
  → If the submitted wordmark looks wider and shorter than the reference (letters broadened, cap-height feels relatively smaller): write "CHECK 3: FAIL — wordmark appears wider than reference (horizontal stretch)"
  → If the submitted wordmark looks narrower and taller than the reference: write "CHECK 3: FAIL — wordmark appears narrower than reference (vertical stretch)"

CHECK 4 — Rotation and skew
  → "CHECK 4: OK — no rotation or skew" or "CHECK 4: FAIL — [describe issue]"

CHECK 5 — Colour
  → "CHECK 5: OK — colours match reference" or "CHECK 5: FAIL — [describe issue]"

After completing all five checks, summarise any FAILs with a clear statement of what is wrong.

---

STEP 2 — BRAND GUIDELINE COMPLIANCE
Using only the provided brand documents, check each of these and cite the exact rule:
- Logo version (primary vs symbol)
- Logo colour and background combination (approved vs prohibited)
- Clear space rule
- Minimum size rule

---

STEP 3 — VERDICT
If ANY check in STEP 1 is FAIL, the verdict must be Fail.
If the PIXEL ANALYSIS section flags a stretch issue (⚠️), the verdict must be Fail regardless of visual check results — pixel measurements are mathematically certain.
Do not give a Pass if any distortion was found.

Rules:
- Never use emojis or emoticons in your response.
- Never invent brand rules not in the documents.
- Provide a confidence level: High, Medium, or Low.

Output format — use this exact structure every time:

Confidence: <High | Medium | Low>

Visual issues:
<your CHECK 1 through CHECK 5 results, then distortion summary>

Brand compliance:
<guideline findings with cited rules>

Verdict: <Pass | Fail | Needs review>

Sources:
- <filename>

Evidence:
<direct quotes from the documents supporting your compliance findings. Prefix every quote with its page number using this exact format: [Page N] — e.g. [Page 25] "Minimum clear space is equal to..." You may cite multiple pages.>`;

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

export function queryBrandDocuments(
	question: string,
	docs: BrandDocument[],
	images: UploadedImage[] = []
) {
	const documentContext = buildDocumentContext(docs);

	// Build pixel-analysis context from client-side measurements (deterministic).
	const pixelNotes = images
		.map((img, i) => {
			if (!img.analysis) return null;
			const { width, height, aspectRatio, logoRegion } = img.analysis;
			const lines = [`Image ${i + 1}: ${width}×${height}px, overall aspect ratio ${aspectRatio.toFixed(2)}:1`];
			if (logoRegion) {
				lines.push(
					`  Lime logo region detected: ${logoRegion.w}×${logoRegion.h}px, ` +
					`logo aspect ratio ${logoRegion.aspectRatio.toFixed(2)}:1. ` +
					`The correct Aagee primary logo has an aspect ratio of approximately 3.2:1–3.8:1. ` +
					(logoRegion.aspectRatio > 4.0
						? `⚠️ PIXEL ANALYSIS FLAG: logo region is ${logoRegion.aspectRatio.toFixed(2)}:1 — significantly wider than expected, indicating HORIZONTAL STRETCH.`
						: logoRegion.aspectRatio < 2.5
						? `⚠️ PIXEL ANALYSIS FLAG: logo region is ${logoRegion.aspectRatio.toFixed(2)}:1 — narrower than expected, indicating VERTICAL STRETCH.`
						: `Aspect ratio within normal range.`)
				);
			}
			return lines.join('\n');
		})
		.filter(Boolean)
		.join('\n');

	const pixelContext = pixelNotes
		? `\nPIXEL ANALYSIS (computed mathematically from the submitted image — treat as ground truth):\n${pixelNotes}\n`
		: '';

	const textContent = `Brand documents:\n\n${documentContext}\n\n---\n${pixelContext}\nQuestion: ${question}`;

	type ContentPart =
		| { type: 'text'; text: string }
		| { type: 'image'; image: string; mimeType: string };

	const hasImages = images.length > 0;

	if (!hasImages) {
		return streamText({
			model: anthropic('claude-sonnet-4-6'),
			system: TEXT_ONLY_SYSTEM_PROMPT,
			messages: [{ role: 'user', content: textContent }],
			maxOutputTokens: 1024
		});
	}

	const refs = loadReferenceImages();
	console.log(`[brand-engine] image review: ${refs.length} reference images, ${images.length} uploaded image(s)`);

	// Interleave each reference image with its label so Claude can clearly match them.
	const refParts: ContentPart[] = refs.flatMap((ref): ContentPart[] => [
		{ type: 'text', text: ref.label },
		{ type: 'image', image: ref.data, mimeType: 'image/jpeg' }
	]);

	const userContent: ContentPart[] = [
		{ type: 'text', text: 'GROUP A — CANONICAL REFERENCE IMAGES (correct approved brand assets):' },
		...refParts,
		{ type: 'text', text: 'GROUP B — IMAGES UNDER REVIEW (submitted for compliance checking):' },
		...images.map((img): ContentPart => ({
			type: 'image',
			image: img.data,
			mimeType: img.mimeType
		})),
		{ type: 'text', text: textContent }
	];

	return streamText({
		model: anthropic('claude-opus-4-5'),
		system: IMAGE_REVIEW_SYSTEM_PROMPT,
		messages: [{ role: 'user', content: userContent }],
		maxOutputTokens: 3000
	});
}
