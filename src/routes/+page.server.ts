import { ACTIVE_BRAND } from '$env/static/private';
import { getBrandConfig } from '$lib/brands/index.js';

export function load() {
	return {
		brand: getBrandConfig(ACTIVE_BRAND)
	};
}
