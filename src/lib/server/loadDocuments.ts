import { ACTIVE_BRAND } from '$env/static/private';

// All brand documents across all brand subfolders, bundled at build time.
// Filter at runtime by ACTIVE_BRAND to serve only the relevant brand's docs.
const rawFiles = import.meta.glob('/src/lib/brand-documents/**/*.md', {
	query: '?raw',
	eager: true
}) as Record<string, { default: string }>;

export interface BrandDocument {
	filename: string;
	content: string;
}

export function loadDocuments(): BrandDocument[] {
	return Object.entries(rawFiles)
		.filter(([path]) => {
			// path: /src/lib/brand-documents/<brand>/<file>.md
			const segments = path.split('/');
			const brandIdx = segments.indexOf('brand-documents');
			return brandIdx !== -1 && segments[brandIdx + 1] === ACTIVE_BRAND;
		})
		.map(([path, mod]) => {
			const filename = path.split('/').at(-1) ?? path;
			const content = mod.default?.trim() ?? '';
			return content ? { filename, content } : null;
		})
		.filter((doc): doc is BrandDocument => doc !== null);
}
