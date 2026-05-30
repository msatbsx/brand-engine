import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// Resolve path relative to this module file — works locally and on Vercel.
const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../brand-assets');

export interface ReferenceImage {
	filename: string;
	label: string;
	data: string; // raw base64, no data-URL prefix
}

const REFERENCE_FILES: { filename: string; label: string }[] = [
	{
		filename: 'logo-primary-reference.jpg',
		label: 'CANONICAL REFERENCE — Primary logo (correct proportions, Lime on Black and Lime backgrounds)'
	},
	{
		filename: 'logo-symbol-reference.jpg',
		label: 'CANONICAL REFERENCE — Symbol logo (correct proportions)'
	},
	{
		filename: 'color-palette-reference.jpg',
		label: 'CANONICAL REFERENCE — Approved colour palette with exact hex codes'
	},
	{
		filename: 'logo-backgrounds-reference.jpg',
		label: 'CANONICAL REFERENCE — Approved and prohibited logo background combinations'
	}
];

export function loadReferenceImages(): ReferenceImage[] {
	return REFERENCE_FILES.flatMap(({ filename, label }) => {
		try {
			const data = readFileSync(join(ASSETS_DIR, filename)).toString('base64');
			return [{ filename, label, data }];
		} catch {
			console.warn(`Reference image not found: ${filename} — run yarn preprocess to generate it.`);
			return [];
		}
	});
}
