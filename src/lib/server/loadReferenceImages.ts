import { ACTIVE_BRAND } from '$env/static/private';

// Eagerly load references.json for every brand subfolder.
// Vite bundles all of them; we pick the active brand at runtime.
const allRefs = import.meta.glob('/src/lib/brand-assets/*/references.json', {
	eager: true
}) as Record<string, { default: Record<string, { label: string; data: string }> }>;

export interface ReferenceImage {
	label: string;
	data: string; // raw base64, no data-URL prefix
}

export function loadReferenceImages(): ReferenceImage[] {
	const key = `/src/lib/brand-assets/${ACTIVE_BRAND}/references.json`;
	const mod = allRefs[key];
	if (!mod) {
		console.error(`[brand-engine] No references.json found for brand "${ACTIVE_BRAND}" (key: ${key})`);
		return [];
	}

	const refs = mod.default;
	for (const [name, { data }] of Object.entries(refs)) {
		const ok = typeof data === 'string' && data.length > 1000;
		console.log(`[ref:${ACTIVE_BRAND}] ${name}: ${ok ? `${data.length.toLocaleString()} chars, starts ${data.slice(0, 12)}` : 'MISSING OR INVALID'}`);
	}

	return Object.values(refs).map(({ label, data }) => ({ label, data }));
}
