/**
 * Client-side image analysis for detecting geometric distortion in brand assets.
 * Uses Canvas API to analyze pixel data — no AI required, fully deterministic.
 */

export interface ImageAnalysis {
	width: number;
	height: number;
	aspectRatio: number;
	/** Bounding box of the primary brand colour (Lime #DDFB66) pixels, if found */
	logoRegion: { x: number; y: number; w: number; h: number; aspectRatio: number } | null;
}

// Aagee Lime colour (#DDFB66) with generous tolerance for JPEG compression artefacts
const LIME_MIN = { r: 180, g: 220, b: 50 };
const LIME_MAX = { r: 255, g: 255, b: 130 };

function isLime(r: number, g: number, b: number): boolean {
	return (
		r >= LIME_MIN.r && r <= LIME_MAX.r &&
		g >= LIME_MIN.g && g <= LIME_MAX.g &&
		b >= LIME_MIN.b && b <= LIME_MAX.b
	);
}

export function analyzeImageData(canvas: HTMLCanvasElement): ImageAnalysis {
	const ctx = canvas.getContext('2d')!;
	const { width, height } = canvas;
	const data = ctx.getImageData(0, 0, width, height).data;

	let minX = width, maxX = 0, minY = height, maxY = 0;
	let limePixels = 0;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			if (isLime(data[i], data[i + 1], data[i + 2])) {
				limePixels++;
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}

	const logoRegion =
		limePixels > (width * height * 0.005) // at least 0.5% lime pixels
			? {
					x: minX,
					y: minY,
					w: maxX - minX,
					h: maxY - minY,
					aspectRatio: (maxX - minX) / Math.max(1, maxY - minY)
				}
			: null;

	return {
		width,
		height,
		aspectRatio: width / height,
		logoRegion
	};
}

export async function analyzeImageFile(dataUrl: string): Promise<ImageAnalysis> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			// Downscale for performance — 600px wide is enough for colour analysis
			const scale = Math.min(1, 600 / img.naturalWidth);
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(img.naturalWidth * scale);
			canvas.height = Math.round(img.naturalHeight * scale);
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			resolve(analyzeImageData(canvas));
		};
		img.onerror = reject;
		img.src = dataUrl;
	});
}
