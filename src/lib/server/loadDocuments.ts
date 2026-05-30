// Brand documents are bundled at build time via Vite's import.meta.glob.
// This works on Vercel (and anywhere else) without filesystem access at runtime.
const rawFiles = import.meta.glob('/src/lib/brand-documents/*.md', {
	query: '?raw',
	eager: true
}) as Record<string, { default: string }>;

export interface BrandDocument {
	filename: string;
	content: string;
}

export function loadDocuments(): BrandDocument[] {
	return Object.entries(rawFiles)
		.map(([path, mod]) => {
			const filename = path.split('/').at(-1) ?? path;
			const content = mod.default?.trim() ?? '';
			return content ? { filename, content } : null;
		})
		.filter((doc): doc is BrandDocument => doc !== null);
}
