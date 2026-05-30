/**
 * Preprocesses image-based PDF brand documents by converting pages to images,
 * sending them to Claude vision, and saving the extracted content as markdown.
 *
 * Usage:  yarn preprocess
 * Force:  yarn preprocess:force
 */

import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';
import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { tmpdir } from 'os';

const DOCS_DIR = join(process.cwd(), 'src/lib/brand-documents');
const ASSETS_DIR = join(process.cwd(), 'src/lib/brand-assets');
const PAGES_PER_BATCH = 8;
const DPI = 96;

// Pages to extract as canonical visual reference images (1-based).
// Update these if the brand guidelines PDF changes.
const REFERENCE_PAGES: Record<string, string> = {
	'5': 'logo-primary-reference.jpg',
	'6': 'logo-symbol-reference.jpg',
	'13': 'color-palette-reference.jpg',
	'16': 'logo-backgrounds-reference.jpg'
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const force = process.argv.includes('--force');

async function main() {
	if (!process.env.ANTHROPIC_API_KEY) {
		console.error('Error: ANTHROPIC_API_KEY is not set.');
		process.exit(1);
	}

	const entries = await readdir(DOCS_DIR);
	const pdfs = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));

	if (pdfs.length === 0) {
		console.log('No PDF files found in', DOCS_DIR);
		return;
	}

	for (const pdf of pdfs) {
		const pdfPath = join(DOCS_DIR, pdf);
		const outputMd = join(DOCS_DIR, basename(pdf, extname(pdf)) + '-extracted.md');

		if (!force && existsSync(outputMd)) {
			console.log(`⏭  Skipping "${pdf}" — already extracted. Use yarn preprocess:force to re-run.`);
			continue;
		}

		console.log(`\n📄 Processing: ${pdf}`);
		await processPdf(pdfPath, pdf, outputMd);
	}

	await extractReferenceImages(pdfs[0]);
	console.log('\n✅ Done.');
}

async function processPdf(pdfPath: string, filename: string, outputMd: string) {
	const tmpDir = join(tmpdir(), `brand-engine-${Date.now()}`);
	await mkdir(tmpDir, { recursive: true });

	try {
		console.log(`  Converting pages to images at ${DPI} DPI…`);
		execSync(`pdftoppm -r ${DPI} -jpeg "${pdfPath}" "${join(tmpDir, 'page')}"`);

		const imageFiles = (await readdir(tmpDir))
			.filter((f) => f.endsWith('.jpg'))
			.sort()
			.map((f) => join(tmpDir, f));

		console.log(`  Found ${imageFiles.length} pages.`);

		const batches: string[][] = [];
		for (let i = 0; i < imageFiles.length; i += PAGES_PER_BATCH) {
			batches.push(imageFiles.slice(i, i + PAGES_PER_BATCH));
		}

		const batchResults: string[] = [];

		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i];
			const pageStart = i * PAGES_PER_BATCH + 1;
			const pageEnd = pageStart + batch.length - 1;
			console.log(`  Batch ${i + 1}/${batches.length}: pages ${pageStart}–${pageEnd}…`);

			const result = await extractFromPages(batch, filename, pageStart, pageEnd, batches.length);
			batchResults.push(result);
		}

		let finalContent: string;
		if (batchResults.length === 1) {
			finalContent = batchResults[0];
		} else {
			console.log('  Merging all batches…');
			finalContent = await mergeResults(batchResults, filename);
		}

		await writeFile(outputMd, finalContent, 'utf-8');
		console.log(`  ✅ Saved → ${basename(outputMd)}`);
	} finally {
		await rm(tmpDir, { recursive: true, force: true });
	}
}

async function extractFromPages(
	imagePaths: string[],
	filename: string,
	pageStart: number,
	pageEnd: number,
	totalBatches: number
): Promise<string> {
	const imageBlocks: Anthropic.ImageBlockParam[] = await Promise.all(
		imagePaths.map(async (p) => {
			const data = await readFile(p);
			return {
				type: 'image' as const,
				source: {
					type: 'base64' as const,
					media_type: 'image/jpeg' as const,
					data: data.toString('base64')
				}
			};
		})
	);

	const batchNote =
		totalBatches > 1
			? `These are pages ${pageStart}–${pageEnd} of the full document.`
			: 'These are all pages of the document.';

	const response = await client.messages.create({
		model: 'claude-sonnet-4-6',
		max_tokens: 4096,
		messages: [
			{
				role: 'user',
				content: [
					...imageBlocks,
					{
						type: 'text',
						text: `You are extracting brand guidelines from a visual brand document called "${filename}".
${batchNote}

Carefully read every page and extract ALL brand information visible. Be precise — copy exact values (hex codes, font names, size numbers, spacing measurements, proportions, rules) exactly as they appear.

Structure your output as clean markdown with clear headings. Cover everything including:
- Logo versions, proportions, clear space rules, minimum sizes
- Prohibited logo uses (copy every item from the list)
- Colour palette (every colour with exact hex code and name)
- Colour combinations to use and combinations to avoid
- Typography: font names, weights, which weight is used for which purpose
- Graphic elements and their rules
- Imagery guidelines
- Brand in use examples
- Any other rules or guidance shown

Skip section divider pages that contain no content.
Do not add commentary — only extract what is explicitly shown in the document.`
					}
				]
			}
		]
	});

	const block = response.content[0];
	return block.type === 'text' ? block.text : '';
}

async function mergeResults(parts: string[], filename: string): Promise<string> {
	const combined = parts
		.map((part, i) => `<!-- Batch ${i + 1} -->\n\n${part}`)
		.join('\n\n---\n\n');

	const response = await client.messages.create({
		model: 'claude-sonnet-4-6',
		max_tokens: 4096,
		messages: [
			{
				role: 'user',
				content: `The following sections were extracted from different page batches of the brand document "${filename}".

Merge them into a single, clean, well-structured markdown document. Remove duplicates. Preserve every exact value (hex codes, sizes, font names, rules). Use logical heading hierarchy.

${combined}`
			}
		]
	});

	const block = response.content[0];
	return block.type === 'text' ? block.text : combined;
}

async function extractReferenceImages(pdfFilename: string) {
	const pdfPath = join(DOCS_DIR, pdfFilename);
	await mkdir(ASSETS_DIR, { recursive: true });

	const jsonOutputPath = join(ASSETS_DIR, 'references.json');
	if (!force && existsSync(jsonOutputPath)) {
		console.log('\n🖼  Skipping reference image extraction — references.json already exists. Use yarn preprocess:force to re-run.');
		return;
	}

	console.log('\n🖼  Extracting reference images…');

	const output: Record<string, { label: string; data: string }> = {};

	for (const [page, outputFilename] of Object.entries(REFERENCE_PAGES)) {
		const tmpPrefix = join(ASSETS_DIR, '_tmp_ref');
		execSync(`pdftoppm -r 150 -jpeg -f ${page} -l ${page} "${pdfPath}" "${tmpPrefix}"`);
		const tmpFile = `${tmpPrefix}-${String(page).padStart(2, '0')}.jpg`;
		const imageBuffer = await readFile(tmpFile);
		execSync(`rm "${tmpFile}"`);

		const base64 = imageBuffer.toString('base64');
		const key = outputFilename.replace(/-reference\.jpg$/, '').replace(/-/g, '_');
		const label = LABELS[outputFilename] ?? outputFilename;

		output[key] = { label, data: base64 };
		console.log(`  ✅ ${outputFilename} → ${key} (${base64.length.toLocaleString()} chars)`);
	}

	await writeFile(jsonOutputPath, JSON.stringify(output), 'utf-8');
	console.log(`  ✅ Saved → references.json`);
}

const LABELS: Record<string, string> = {
	'logo-primary-reference.jpg':
		'CANONICAL REFERENCE — Primary logo (correct proportions, Lime on Black and Lime backgrounds)',
	'logo-symbol-reference.jpg': 'CANONICAL REFERENCE — Symbol logo (correct proportions)',
	'color-palette-reference.jpg':
		'CANONICAL REFERENCE — Approved colour palette with exact hex codes',
	'logo-backgrounds-reference.jpg':
		'CANONICAL REFERENCE — Approved and prohibited logo background combinations'
};

main().catch((err) => {
	console.error('Error:', err.message ?? err);
	process.exit(1);
});
