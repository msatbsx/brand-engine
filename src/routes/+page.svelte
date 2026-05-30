<script lang="ts">
	interface AnswerState {
		raw: string;
		mode: 'text' | 'image-review';
		confidence: string | null;
		// text-only mode
		answer: string | null;
		// image-review mode
		visualIssues: string | null;
		brandCompliance: string | null;
		verdict: string | null;
		// shared
		sources: string[];
		evidence: string | null;
	}

	interface ImagePreview {
		dataUrl: string;
		mimeType: string;
		name: string;
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
	let visualIssuesOpen = $state(true);
	let brandComplianceOpen = $state(true);
	let fullResponseOpen = $state(false);
	let fileInput: HTMLInputElement;

	const confidenceColour: Record<string, string> = {
		High: 'bg-emerald-100 text-emerald-800',
		Medium: 'bg-amber-100 text-amber-800',
		Low: 'bg-red-100 text-red-800'
	};

	// Matches a section header in any format Claude might use:
	// "Visual issues:", "**Visual issues:**", "## Visual issues", "VISUAL ISSUES:", etc.
	function sectionRegex(name: string) {
		return new RegExp(`(?:#{1,6}\\s*|\\*{1,2})*${name}(?:\\*{1,2})*:?\\s*`, 'i');
	}

	// Extract the text content of a named section, stopping at any of the next section headers.
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

	function parseAnswer(raw: string, hasImages: boolean): AnswerState {
		const confidenceMatch = raw.match(/Confidence:\s*(High|Medium|Low)/i);

		const sources = (extractSection(raw, 'Sources', ['Evidence']) ?? '')
			.split('\n')
			.map((s) => s.replace(/^[-*]\s*/, '').trim())
			.filter(Boolean);

		const evidence = extractSection(raw, 'Evidence', []);

		if (hasImages) {
			const visualIssues = extractSection(raw, 'Visual issues', [
				'Brand compliance',
				'Verdict',
				'Sources',
				'Evidence'
			]);
			const brandCompliance = extractSection(raw, 'Brand compliance', [
				'Verdict',
				'Sources',
				'Evidence'
			]);
			const verdictRaw = raw.match(/(?:#{1,6}\s*|\*{1,2})*Verdict(?:\*{1,2})*:?\s*([^\n]+)/i);

			return {
				raw,
				mode: 'image-review',
				confidence: confidenceMatch ? confidenceMatch[1] : null,
				answer: null,
				visualIssues,
				brandCompliance,
				verdict: verdictRaw ? verdictRaw[1].replace(/\*+/g, '').trim() : null,
				sources,
				evidence
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
			evidence
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
			images = [...images, { dataUrl, mimeType: file.type, name: file.name }];
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

	async function handleSubmit() {
		if (!question.trim() || loading) return;

		loading = true;
		error = null;
		result = null;
		streamedText = '';
		evidenceOpen = false;
		visualIssuesOpen = true;
		brandComplianceOpen = true;
		fullResponseOpen = false;

		try {
			const payload = {
				question: question.trim(),
				images: images.map((img) => ({
					// Strip the data URL prefix — send only the raw base64
					data: img.dataUrl.split(',')[1],
					mimeType: img.mimeType
				}))
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

			result = parseAnswer(streamedText, images.length > 0);
		} catch {
			error = 'Could not reach the server. Please try again.';
		} finally {
			loading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
	}
</script>

<span class="fixed top-3 right-4 text-xs text-[#2D2D2D]/30 select-none">
	v{__APP_VERSION__}
</span>

<main class="min-h-screen bg-[#F7F7F5] flex flex-col items-center justify-start px-4 py-16">
	<div class="w-full max-w-2xl flex flex-col gap-8">

		<!-- Header -->
		<div class="text-center">
			<h1 class="text-3xl font-bold text-[#1A2B5F] tracking-tight">Brand Engine</h1>
			<p class="mt-2 text-sm text-[#2D2D2D]/60">
				Ask about the brand guidelines, or upload a design to check compliance.
			</p>
		</div>

		<!-- Form -->
		<form onsubmit={handleSubmit} class="flex flex-col gap-3">

			<!-- Image upload area -->
			<div
				role="button"
				tabindex="0"
				class="relative rounded-xl border-2 border-dashed transition cursor-pointer
					{dragging
						? 'border-[#1A2B5F] bg-[#1A2B5F]/5'
						: 'border-[#2D2D2D]/15 hover:border-[#2D2D2D]/30 bg-white'}"
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
				onclick={() => fileInput.click()}
				onkeydown={(e) => e.key === 'Enter' && fileInput.click()}
			>
				{#if images.length === 0}
					<div class="flex flex-col items-center justify-center gap-1 py-6 px-4 text-center pointer-events-none">
						<svg class="w-7 h-7 text-[#2D2D2D]/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
								d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zM3.75 21h16.5a.75.75 0 00.75-.75V6.75a.75.75 0 00-.75-.75H3.75a.75.75 0 00-.75.75v13.5c0 .414.336.75.75.75z" />
						</svg>
						<p class="text-sm text-[#2D2D2D]/40">
							Drop images here or <span class="text-[#1A2B5F]">browse</span>
						</p>
						<p class="text-xs text-[#2D2D2D]/30">JPEG, PNG, GIF, WebP · up to {MAX_MB} MB each · max {MAX_IMAGES}</p>
					</div>
				{:else}
					<div class="flex flex-wrap gap-3 p-3">
						{#each images as img, i}
							<div class="relative group">
								<img
									src={img.dataUrl}
									alt={img.name}
									class="h-20 w-20 rounded-lg object-cover border border-[#2D2D2D]/10"
								/>
								<button
									type="button"
									onclick={(e) => { e.stopPropagation(); removeImage(i); }}
									class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#2D2D2D] text-white text-xs
										flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
									aria-label="Remove {img.name}"
								>✕</button>
							</div>
						{/each}

						{#if images.length < MAX_IMAGES}
							<div class="h-20 w-20 rounded-lg border-2 border-dashed border-[#2D2D2D]/15
								flex items-center justify-center text-[#2D2D2D]/30 text-xl hover:border-[#2D2D2D]/30 transition">
								+
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Hidden file input -->
			<input
				bind:this={fileInput}
				type="file"
				accept={ALLOWED_TYPES.join(',')}
				multiple
				class="hidden"
				onchange={handleFileInput}
			/>

			<!-- Text input -->
			<textarea
				bind:value={question}
				onkeydown={handleKeydown}
				placeholder={images.length
					? 'Describe what you want checked, e.g. "Does this design comply with the brand guidelines?"'
					: 'e.g. Can I use the logo on a dark background?'}
				rows={3}
				disabled={loading}
				class="w-full rounded-xl border border-[#2D2D2D]/15 bg-white px-4 py-3 text-[#2D2D2D] text-base
					resize-none shadow-sm placeholder:text-[#2D2D2D]/35 focus:outline-none focus:ring-2
					focus:ring-[#1A2B5F]/30 disabled:opacity-50 transition"
			></textarea>

			<div class="flex items-center justify-between">
				<span class="text-xs text-[#2D2D2D]/40">⌘ + Enter to submit</span>
				<button
					type="submit"
					disabled={loading || !question.trim()}
					class="rounded-lg bg-[#1A2B5F] px-5 py-2 text-sm font-medium text-white shadow-sm
						hover:bg-[#1A2B5F]/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
				>
					{loading ? 'Thinking…' : images.length ? 'Check design' : 'Ask'}
				</button>
			</div>
		</form>

		<!-- Error -->
		{#if error}
			<div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
				{error}
			</div>
		{/if}

		<!-- Streaming placeholder -->
		{#if loading && !streamedText}
			<div class="rounded-xl border border-[#2D2D2D]/10 bg-white px-5 py-4 text-sm text-[#2D2D2D]/40 animate-pulse">
				{images.length ? 'Analysing design against brand guidelines…' : 'Reading brand documents…'}
			</div>
		{:else if loading && streamedText}
			<div class="rounded-xl border border-[#2D2D2D]/10 bg-white px-5 py-4 text-sm text-[#2D2D2D]/60 whitespace-pre-wrap">
				{streamedText}
			</div>
		{/if}

		<!-- Result -->
		{#if result && !loading}
			<div class="rounded-xl border border-[#2D2D2D]/10 bg-white px-5 py-5 flex flex-col gap-4 shadow-sm">

				<!-- Confidence + Verdict row -->
				<div class="flex items-center gap-3 flex-wrap">
					{#if result.confidence}
						<div class="flex items-center gap-1.5">
							<span class="text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wide">Confidence</span>
							<span class="rounded-full px-2.5 py-0.5 text-xs font-semibold {confidenceColour[result.confidence] ?? 'bg-gray-100 text-gray-700'}">
								{result.confidence}
							</span>
						</div>
					{/if}
					{#if result.verdict}
						<div class="flex items-center gap-1.5">
							<span class="text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wide">Verdict</span>
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
					<!-- Visual issues (collapsible, open by default) -->
					<div class="border-t border-[#2D2D2D]/8 pt-3">
						<button
							onclick={() => (visualIssuesOpen = !visualIssuesOpen)}
							class="w-full flex items-center justify-between text-xs font-semibold text-[#2D2D2D]/50 uppercase tracking-wide hover:text-[#2D2D2D] transition"
						>
							<span>Visual issues</span>
							<span>{visualIssuesOpen ? '▲' : '▼'}</span>
						</button>
						{#if visualIssuesOpen}
							<div class="mt-2 text-sm text-[#2D2D2D] leading-relaxed whitespace-pre-wrap">
								{#if result.visualIssues}
								{result.visualIssues}
							{:else}
								<span class="text-[#2D2D2D]/40 italic">Could not parse this section — see Full response below.</span>
							{/if}
							</div>
						{/if}
					</div>

					<!-- Brand compliance (collapsible, open by default) -->
					<div class="border-t border-[#2D2D2D]/8 pt-3">
						<button
							onclick={() => (brandComplianceOpen = !brandComplianceOpen)}
							class="w-full flex items-center justify-between text-xs font-semibold text-[#2D2D2D]/50 uppercase tracking-wide hover:text-[#2D2D2D] transition"
						>
							<span>Brand compliance</span>
							<span>{brandComplianceOpen ? '▲' : '▼'}</span>
						</button>
						{#if brandComplianceOpen}
							<div class="mt-2 text-sm text-[#2D2D2D] leading-relaxed whitespace-pre-wrap">
								{#if result.brandCompliance}
									{result.brandCompliance}
								{:else}
									<span class="text-[#2D2D2D]/40 italic">Could not parse this section — see Full response below.</span>
								{/if}
							</div>
						{/if}
					</div>
				{:else}
					<!-- Plain answer -->
					<div class="text-[#2D2D2D] text-sm leading-relaxed whitespace-pre-wrap">
						{result.answer ?? result.raw}
					</div>
				{/if}

				<!-- Sources -->
				{#if result.sources.length > 0}
					<div class="border-t border-[#2D2D2D]/8 pt-3 flex flex-wrap gap-2">
						{#each result.sources as source}
							<span class="rounded-md bg-[#1A2B5F]/8 px-2.5 py-1 text-xs font-medium text-[#1A2B5F]">
								{source}
							</span>
						{/each}
					</div>
				{/if}

				<!-- Evidence -->
				{#if result.evidence}
					<div class="border-t border-[#2D2D2D]/8 pt-3">
						<button
							onclick={() => (evidenceOpen = !evidenceOpen)}
							class="text-xs text-[#2D2D2D]/50 hover:text-[#2D2D2D] transition flex items-center gap-1"
						>
							Show evidence {evidenceOpen ? '▲' : '▼'}
						</button>
						{#if evidenceOpen}
							<blockquote class="mt-2 border-l-2 border-[#E8614D] pl-3 text-xs text-[#2D2D2D]/60 italic whitespace-pre-wrap">
								{result.evidence}
							</blockquote>
						{/if}
					</div>
				{/if}

				<!-- Full raw response -->
				<div class="border-t border-[#2D2D2D]/8 pt-3">
					<button
						onclick={() => (fullResponseOpen = !fullResponseOpen)}
						class="text-xs text-[#2D2D2D]/40 hover:text-[#2D2D2D] transition flex items-center gap-1"
					>
						Full response {fullResponseOpen ? '▲' : '▼'}
					</button>
					{#if fullResponseOpen}
						<pre class="mt-2 text-xs text-[#2D2D2D]/60 whitespace-pre-wrap font-mono leading-relaxed">{result.raw}</pre>
					{/if}
				</div>

			</div>

			<p class="text-center text-xs text-[#2D2D2D]/35">"{question}"</p>
		{/if}

	</div>
</main>
