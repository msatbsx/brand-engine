import type { BrandConfig } from './types.js';
import aagee from './aagee.js';
import cprime from './cprime.js';

export type { BrandConfig };

const brands: Record<string, BrandConfig> = { aagee, cprime };

export function getBrandConfig(brandId: string): BrandConfig {
	return brands[brandId] ?? aagee;
}
