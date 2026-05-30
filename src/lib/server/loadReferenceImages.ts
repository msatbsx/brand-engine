// JSON import — Vite handles this via JSON.parse() at build time.
// More reliable than TypeScript string literals for large binary-encoded data.
import refs from '../brand-assets/references.json';

export interface ReferenceImage {
	label: string;
	data: string; // raw base64, no data-URL prefix
}

type RefsJson = Record<string, { label: string; data: string }>;

export function loadReferenceImages(): ReferenceImage[] {
	const entries = Object.values(refs as RefsJson).map(({ label, data }) => ({ label, data }));

	// Diagnostic: log presence and length of each reference on every request.
	// Check Vercel function logs if stretch detection behaves differently across environments.
	for (const [key, { data }] of Object.entries(refs as RefsJson)) {
		const ok = typeof data === 'string' && data.length > 1000;
		console.log(`[ref] ${key}: ${ok ? `${data.length.toLocaleString()} chars, starts ${data.slice(0, 12)}` : 'MISSING OR INVALID'}`);
	}

	return entries;
}
