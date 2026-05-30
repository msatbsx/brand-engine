// Vite's ?inline query bundles each image directly into the JS output as a
// base64 data URL — no filesystem reads at runtime, works on Vercel and everywhere else.
const inlinedRefs = import.meta.glob('/src/lib/brand-assets/*.jpg', {
	query: '?inline',
	eager: true
}) as Record<string, { default: string }>;

export interface ReferenceImage {
	filename: string;
	label: string;
	data: string; // raw base64, no data-URL prefix
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

export function loadReferenceImages(): ReferenceImage[] {
	return Object.entries(inlinedRefs).flatMap(([path, mod]) => {
		const filename = path.split('/').at(-1) ?? path;
		const dataUrl: string = mod.default ?? '';

		if (!dataUrl) {
			console.warn(`Empty reference image: ${filename}`);
			return [];
		}

		// ?inline returns "data:image/jpeg;base64,<actual_base64>"
		// Anthropic expects raw base64 only — strip everything up to and including the comma.
		const data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

		return [{ filename, label: LABELS[filename] ?? `CANONICAL REFERENCE — ${filename}`, data }];
	});
}
