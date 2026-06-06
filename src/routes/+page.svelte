<script lang="ts">
	import { fade } from 'svelte/transition';
	import { marked } from 'marked';
	import { analyzeImageFile, type ImageAnalysis } from '$lib/analyzeImage.js';
	import type { BrandConfig } from '$lib/brands/types.js';

	let { data } = $props<{ data: { brand: BrandConfig } }>();
	const brand = data.brand;

	marked.setOptions({ breaks: true });

	function md(text: string | null | undefined): string {
		if (!text) return '';
		return marked.parse(text) as string;
	}

	interface TokenUsage {
		promptTokens: number;
		completionTokens: number;
	}

	interface AnswerState {
		raw: string;
		mode: 'text' | 'image-review';
		confidence: string | null;
		answer: string | null;
		visualIssues: string | null;
		brandCompliance: string | null;
		verdict: string | null;
		sources: string[];
		evidence: string | null;
		pageRefs: number[];
	}

	interface ImagePreview {
		dataUrl: string;
		mimeType: string;
		name: string;
		analysis: ImageAnalysis | null;
	}

	const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
	const MAX_IMAGES = 5;
	const MAX_MB = 5;

	let question = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let result = $state<AnswerState | null>(null);
	let streamedText = $state('');
	let images = $state<ImagePreview[]>([]);
	let dragging = $state(false);
	let evidenceOpen = $state(false);
	let visualIssuesOpen = $state(false);
	let brandComplianceOpen = $state(false);
	let fullResponseOpen = $state(false);
	let tokenUsage = $state<TokenUsage | null>(null);
	let fileInput: HTMLInputElement;
	let askFocused = $state(false);

	const confidenceColour: Record<string, string> = {
		High: 'bg-emerald-100 text-emerald-800',
		Medium: 'bg-amber-100 text-amber-800',
		Low: 'bg-red-100 text-red-800'
	};

	function sectionRegex(name: string) {
		return new RegExp(
			`(?:step\\s*\\d+\\s*[—–-]+\\s*)?(?:#{1,6}\\s*|\\*{1,2})*${name}(?:\\*{1,2})*:?\\s*`,
			'i'
		);
	}

	function extractSection(text: string, name: string, stopAt: string[]): string | null {
		const headerRe = sectionRegex(name);
		const match = headerRe.exec(text);
		if (!match) return null;

		const contentStart = match.index + match[0].length;
		let contentEnd = text.length;

		for (const stop of stopAt) {
			const stopRe = sectionRegex(stop);
			const stopMatch = stopRe.exec(text.slice(contentStart));
			if (stopMatch) {
				const idx = contentStart + stopMatch.index;
				if (idx < contentEnd) contentEnd = idx;
			}
		}

		return text.slice(contentStart, contentEnd).trim() || null;
	}

	function extractPageRefs(text: string): number[] {
		const matches = [...text.matchAll(/\[?[Pp]age\s+0*(\d+)\]?/g)];
		const nums = matches.map(m => parseInt(m[1])).filter(n => n >= 1 && n <= 90);
		return [...new Set(nums)].sort((a, b) => a - b);
	}

	function pageUrl(n: number): string {
		return `/brand/cprime/pages/page-${String(n).padStart(2, '0')}.jpg`;
	}

	function parseAnswer(raw: string, hasImages: boolean): AnswerState {
		const confidenceMatch =
			raw.match(/\bconfidence\b[^a-z\n]*:?\s*\*{0,2}(High|Medium|Low)\*{0,2}/i) ??
			raw.match(/\bconfidence\b[^\n]*\n+\*{0,2}(High|Medium|Low)\*{0,2}/i);

		const sources = (extractSection(raw, 'Sources', ['Evidence']) ?? '')
			.split('\n')
			.map((s) => s.replace(/^[-*]\s*/, '').trim())
			.filter(Boolean);

		const evidence = extractSection(raw, 'Evidence', []);

		if (hasImages) {
			const visualIssues =
				extractSection(raw, 'Visual issues', ['brand.*compliance', 'Verdict', 'Sources', 'Evidence']) ??
				extractSection(raw, 'distortion checks', ['brand.*compliance', 'Verdict', 'Sources', 'Evidence']);

			const brandCompliance =
				extractSection(raw, 'brand.*compliance', ['Verdict', 'Sources', 'Evidence']) ??
				extractSection(raw, 'guideline compliance', ['Verdict', 'Sources', 'Evidence']);

			const verdictRaw =
				raw.match(/\bverdict\b[^a-z\n]*:?\s*\*{0,2}(Pass|Fail|Needs review)\*{0,2}/i) ??
				raw.match(/\bverdict\b[^\n]*\n+\*{0,2}(Pass|Fail|Needs review)\*{0,2}/i);

			return {
				raw,
				mode: 'image-review',
				confidence: confidenceMatch ? confidenceMatch[1] : null,
				answer: null,
				visualIssues,
				brandCompliance,
				verdict: verdictRaw ? verdictRaw[1].trim() : null,
				sources,
				evidence,
				pageRefs: extractPageRefs(raw)
			};
		}

		const answer = extractSection(raw, 'Answer', ['Sources', 'Evidence']);
		return {
			raw,
			mode: 'text',
			confidence: confidenceMatch ? confidenceMatch[1] : null,
			answer,
			visualIssues: null,
			brandCompliance: null,
			verdict: null,
			sources,
			evidence,
			pageRefs: extractPageRefs(raw)
		};
	}

	function readFileAsDataUrl(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	async function addFiles(files: FileList | File[]) {
		const arr = Array.from(files);
		const remaining = MAX_IMAGES - images.length;
		if (remaining <= 0) return;

		for (const file of arr.slice(0, remaining)) {
			if (!ALLOWED_TYPES.includes(file.type)) {
				error = `"${file.name}" is not a supported image type (JPEG, PNG, GIF, WebP).`;
				continue;
			}
			if (file.size > MAX_MB * 1024 * 1024) {
				error = `"${file.name}" exceeds the ${MAX_MB} MB limit.`;
				continue;
			}
			const dataUrl = await readFileAsDataUrl(file);
			const analysis = await analyzeImageFile(dataUrl).catch(() => null);
			images = [...images, { dataUrl, mimeType: file.type, name: file.name, analysis }];
		}
	}

	function removeImage(index: number) {
		images = images.filter((_, i) => i !== index);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragging = true;
	}

	function handleDragLeave() {
		dragging = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (e.dataTransfer?.files) await addFiles(e.dataTransfer.files);
	}

	async function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files) await addFiles(input.files);
		input.value = '';
	}

	async function submitRequest(withImages: boolean) {
		if (!question.trim() || loading) return;

		loading = true;
		error = null;
		result = null;
		streamedText = '';
		tokenUsage = null;
		evidenceOpen = false;
		visualIssuesOpen = false;
		brandComplianceOpen = false;
		fullResponseOpen = false;

		try {
			const payload = {
				question: question.trim(),
				images: withImages
					? images.map((img) => ({
							data: img.dataUrl.split(',')[1],
							mimeType: img.mimeType,
							analysis: img.analysis ?? null
						}))
					: []
			};

			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const data = await response.json();
				error = data.error ?? 'Something went wrong.';
				return;
			}

			const reader = response.body!.getReader();
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				streamedText += decoder.decode(value, { stream: true });
			}

			tokenUsage = {
				promptTokens: Math.round(question.length / 4),
				completionTokens: Math.round(streamedText.length / 4)
			};

			result = parseAnswer(streamedText, withImages && images.length > 0);
		} catch {
			error = 'Could not reach the server. Please try again.';
		} finally {
			loading = false;
		}
	}

	async function handleTextSubmit() {
		if (!question.trim() || loading) return;
		await submitRequest(false);
	}

	async function handleImageSubmit() {
		if (images.length === 0 || loading) return;
		if (!question.trim()) {
			question = 'Does this design comply with the Cprime brand guidelines?';
		}
		await submitRequest(true);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleTextSubmit();
	}
</script>

<span class="fixed top-3 right-4 text-xs text-[#161616]/30 select-none font-body">
	v{__APP_VERSION__}
</span>

<main class="min-h-screen bg-[#f8f6ef] flex flex-col items-center px-4 py-14">
	<div class="w-full max-w-[932px] flex flex-col items-center gap-10">

		<!-- Logo + Brand Guru -->
		<header class="flex flex-col items-center gap-2.5">
			{#if brand.logoUrl}
				<img src={brand.logoUrl} alt={brand.logoAlt} class="h-14 w-auto object-contain" />
			{:else}
				<span class="text-[#161616] text-2xl font-condensed font-semibold uppercase tracking-[0.06em]">
					{brand.name}
				</span>
			{/if}
			<h1 class="font-condensed font-semibold text-[#161616] text-3xl uppercase tracking-[0.06em]">
				Brand Guru
			</h1>
		</header>

		<!-- Subtitle -->
		<p class="font-display italic text-[#161616] text-xl text-center max-w-[570px] leading-[1.45] tracking-[0.02em]">
			{brand.introText}
		</p>

		<!-- Input rows -->
		<div class="flex flex-col gap-4 w-full">

			<!-- Row 1: Ask me anything -->
			<div class="flex items-center h-24 bg-white border border-[#d3d3d3] rounded-[100px] px-7 gap-5">
				<span class="font-condensed font-semibold text-[#161616] text-lg uppercase tracking-[0.02em] whitespace-nowrap shrink-0">
					Ask me anything
				</span>
				<input
					bind:value={question}
					onkeydown={handleKeydown}
					onfocus={() => (askFocused = true)}
					onblur={() => (askFocused = false)}
					placeholder="e.g. Can I use the logo on an image?"
					disabled={loading}
					class="flex-1 bg-transparent border-none outline-none shadow-none ring-0 focus:ring-0 text-[#161616] text-lg placeholder:text-[#b3b3b3] font-body disabled:opacity-50"
				/>
				<button
					onclick={handleTextSubmit}
					disabled={loading || !question.trim()}
					class="shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-opacity"
					style="background: linear-gradient(135deg, #FF8E3C 0%, #E739F0 100%); opacity: {askFocused ? 1 : 0.4}"
					aria-label="Submit question"
				>
					<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
					</svg>
				</button>
			</div>

			<!-- Row 2: Check your work (file drop zone) -->
			<div
				role="button"
				tabindex="0"
				class="flex items-center h-24 bg-white border border-[#d3d3d3] rounded-[100px] px-7 gap-5 cursor-pointer transition-colors
					{dragging ? 'border-[#E739F0] bg-[#E739F0]/5' : 'hover:border-[#b3b3b3]'}"
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
				onclick={() => fileInput.click()}
				onkeydown={(e) => e.key === 'Enter' && fileInput.click()}
			>
				<span class="font-condensed font-semibold text-[#161616] text-lg uppercase tracking-[0.02em] whitespace-nowrap shrink-0">
					Check your work
				</span>

				{#if images.length === 0}
					<div class="flex items-center gap-3 flex-1 pointer-events-none">
						<img src="/image-icon.svg" alt="" class="w-8 h-8 shrink-0" aria-hidden="true" />
						<p class="text-lg font-body" style="color: #b3b3b3">
							Drop your brand assets here or <span class="font-semibold" style="color: #7a7a7a">browse</span>
						</p>
					</div>
				{:else}
					<div class="flex items-center gap-2.5 flex-1 overflow-hidden pointer-events-none">
						{#each images as img, i}
							<div class="relative group shrink-0">
								<img
									src={img.dataUrl}
									alt={img.name}
									class="h-14 w-14 rounded-full object-cover border border-[#d3d3d3]"
								/>
								<button
									type="button"
									onclick={(e) => { e.stopPropagation(); removeImage(i); }}
									class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#161616] text-white text-[10px]
										flex items-center justify-center opacity-0 group-hover:opacity-100 transition pointer-events-auto"
									aria-label="Remove {img.name}"
								>✕</button>
							</div>
						{/each}
						{#if images.length < MAX_IMAGES}
							<div class="h-14 w-14 rounded-full border-2 border-dashed border-[#d3d3d3]
								flex items-center justify-center text-[#d3d3d3] text-xl shrink-0">
								+
							</div>
						{/if}
					</div>
				{/if}

				<button
					onclick={(e) => { e.stopPropagation(); handleImageSubmit(); }}
					disabled={loading || images.length === 0}
					class="shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-opacity"
					style="background: linear-gradient(135deg, #FF8E3C 0%, #E739F0 100%); opacity: {images.length > 0 || dragging ? 1 : 0.4}"
					aria-label="Check design"
				>
					<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
					</svg>
				</button>
			</div>

			<input
				bind:this={fileInput}
				type="file"
				accept={ALLOWED_TYPES.join(',')}
				multiple
				class="hidden"
				onchange={handleFileInput}
			/>
		</div>

		<!-- Processing indicator -->
		{#if loading}
			<div transition:fade={{ duration: 150 }} class="flex items-center gap-2.5 text-[#161616]/50">
				<span class="spinner"></span>
				<span class="font-body text-sm tracking-wide">Processing…</span>
			</div>
		{/if}

		<!-- Error -->
		{#if error}
			<div class="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-body">
				{error}
			</div>
		{/if}

		<!-- Streaming / loading -->
		{#if loading && !streamedText}
			<div class="w-full rounded-2xl border border-[#d3d3d3] bg-white px-6 py-4 text-[#161616]/40 animate-pulse font-body">
				{images.length ? 'Analysing design against brand guidelines…' : 'Reading brand documents…'}
			</div>
		{:else if loading && streamedText}
			<div class="w-full rounded-2xl border border-[#d3d3d3] bg-white px-6 py-4 text-[#161616]/60 whitespace-pre-wrap font-body text-sm">
				{streamedText}
			</div>
		{/if}

		<!-- Result -->
		{#if result && !loading}
			<div class="w-full rounded-2xl border border-[#d3d3d3] bg-white px-6 py-6 flex flex-col gap-4 shadow-sm">

				<!-- Confidence + Verdict -->
				<div class="flex items-center gap-3 flex-wrap">
					{#if result.confidence}
						<div class="flex items-center gap-1.5">
							<span class="text-xs font-condensed font-semibold text-[#161616]/50 uppercase tracking-wider">Confidence</span>
							<span class="rounded-full px-2.5 py-0.5 text-xs font-semibold {confidenceColour[result.confidence] ?? 'bg-gray-100 text-gray-700'}">
								{result.confidence}
							</span>
						</div>
					{/if}
					{#if result.verdict}
						<div class="flex items-center gap-1.5">
							<span class="text-xs font-condensed font-semibold text-[#161616]/50 uppercase tracking-wider">Verdict</span>
							<span class="rounded-full px-2.5 py-0.5 text-xs font-semibold
								{result.verdict.toLowerCase().includes('pass')
									? 'bg-emerald-100 text-emerald-800'
									: result.verdict.toLowerCase().includes('fail')
										? 'bg-red-100 text-red-800'
										: 'bg-amber-100 text-amber-800'}">
								{result.verdict}
							</span>
						</div>
					{/if}
				</div>

				{#if result.mode === 'image-review'}
					<div class="border-t border-[#d3d3d3] pt-3">
						<button
							onclick={() => (visualIssuesOpen = !visualIssuesOpen)}
							class="w-full flex items-center justify-between text-xs font-condensed font-semibold text-[#161616]/50 uppercase tracking-wider hover:text-[#161616] transition"
						>
							<span>Visual issues</span>
							<span>{visualIssuesOpen ? '▲' : '▼'}</span>
						</button>
						{#if visualIssuesOpen}
							<div class="mt-2 prose prose-sm max-w-none text-[#161616]">
								{#if result.visualIssues}
									{@html md(result.visualIssues)}
								{:else}
									<span class="text-[#161616]/40 italic">Could not parse this section — see Full response below.</span>
								{/if}
							</div>
						{/if}
					</div>

					<div class="border-t border-[#d3d3d3] pt-3">
						<button
							onclick={() => (brandComplianceOpen = !brandComplianceOpen)}
							class="w-full flex items-center justify-between text-xs font-condensed font-semibold text-[#161616]/50 uppercase tracking-wider hover:text-[#161616] transition"
						>
							<span>Brand compliance</span>
							<span>{brandComplianceOpen ? '▲' : '▼'}</span>
						</button>
						{#if brandComplianceOpen}
							<div class="mt-2 prose prose-sm max-w-none text-[#161616]">
								{#if result.brandCompliance}
									{@html md(result.brandCompliance)}
								{:else}
									<span class="text-[#161616]/40 italic">Could not parse this section — see Full response below.</span>
								{/if}
							</div>
						{/if}
					</div>
				{:else}
					<div class="prose prose-sm max-w-none text-[#161616]">
						{@html md(result.answer ?? result.raw)}
					</div>
				{/if}

				<!-- Guideline page images -->
				{#if result.pageRefs.length > 0}
					<div class="border-t border-[#d3d3d3] pt-4">
						<p class="font-condensed font-semibold text-[#161616]/50 text-xs uppercase tracking-wider mb-3">
							Guideline pages
						</p>
						<div class="flex flex-col gap-4">
							{#each result.pageRefs as n}
								<a
									href={pageUrl(n)}
									target="_blank"
									rel="noopener"
									class="group block"
								>
									<div class="w-full rounded overflow-hidden border border-[#d3d3d3] group-hover:border-[#E739F0] transition-colors shadow-sm">
										<img src={pageUrl(n)} alt="Page {n}" class="w-full block" loading="lazy" />
									</div>
									<span class="text-xs text-[#161616]/40 font-body group-hover:text-[#E739F0] transition-colors mt-1.5 block">
										Page {n}
									</span>
								</a>
							{/each}
						</div>
					</div>
				{/if}

				{#if result.sources.length > 0}
					<div class="border-t border-[#d3d3d3] pt-3 flex flex-wrap gap-2">
						{#each result.sources as source}
							<span class="rounded-md bg-[#E739F0]/10 px-2.5 py-1 text-xs font-semibold font-body text-[#c020cc]">
								{source}
							</span>
						{/each}
					</div>
				{/if}

				{#if result.evidence}
					<div class="border-t border-[#d3d3d3] pt-3">
						<button
							onclick={() => (evidenceOpen = !evidenceOpen)}
							class="text-xs text-[#161616]/50 hover:text-[#161616] transition flex items-center gap-1 font-body"
						>
							Show evidence {evidenceOpen ? '▲' : '▼'}
						</button>
						{#if evidenceOpen}
							<blockquote class="mt-2 border-l-2 border-[#E739F0] pl-3 prose prose-sm max-w-none text-[#161616]/60 italic">
								{@html md(result.evidence)}
							</blockquote>
						{/if}
					</div>
				{/if}

				{#if tokenUsage}
					<div class="border-t border-[#d3d3d3] pt-3">
						<span class="text-xs text-[#161616]/35 font-body">
							~{tokenUsage.completionTokens.toLocaleString()} completion tokens (estimated)
						</span>
					</div>
				{/if}

				<div class="border-t border-[#d3d3d3] pt-3">
					<button
						onclick={() => (fullResponseOpen = !fullResponseOpen)}
						class="text-xs text-[#161616]/40 hover:text-[#161616] transition flex items-center gap-1 font-body"
					>
						Full response {fullResponseOpen ? '▲' : '▼'}
					</button>
					{#if fullResponseOpen}
						<pre class="mt-2 text-xs text-[#161616]/60 whitespace-pre-wrap font-mono leading-relaxed">{result.raw}</pre>
					{/if}
				</div>
			</div>

			<p class="text-center text-xs text-[#161616]/35 font-body">"{question}"</p>
		{/if}

		<!-- Quick links -->
		<section class="w-full">
			<h2 class="font-condensed font-semibold text-[#161616] text-lg uppercase tracking-[0.02em] mb-3">
				Quick links
			</h2>
			<div class="grid grid-cols-3 border-l border-t border-[rgba(133,133,133,0.77)]">
				{#each brand.questions as q, i}
					<button
						type="button"
						disabled={loading}
						onclick={() => { question = q; handleTextSubmit(); }}
						class="quick-link border-r border-b border-[rgba(133,133,133,0.77)] px-6 py-7 text-center text-[#161616] text-base leading-[1.5] font-body
							transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[177px] flex items-center justify-center"
					>
						{q}
					</button>
				{/each}
			</div>
		</section>

	</div>
</main>

<style>
	.quick-link:not(:disabled):hover {
		background: linear-gradient(244deg, rgba(231, 57, 240, 0.5) 23.364%, rgba(251, 242, 223, 0.5) 100.42%);
	}

	.spinner {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid rgba(231, 57, 240, 0.2);
		border-top-color: #E739F0;
		animation: spin 0.75s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
