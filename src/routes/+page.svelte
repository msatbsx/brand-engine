<script lang="ts">
	interface AnswerState {
		raw: string;
		confidence: string | null;
		answer: string | null;
		sources: string[];
		evidence: string | null;
	}

	let question = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let result = $state<AnswerState | null>(null);
	let streamedText = $state('');

	function parseAnswer(raw: string): AnswerState {
		const confidenceMatch = raw.match(/Confidence:\s*(High|Medium|Low)/i);
		const answerMatch = raw.match(/Answer:\s*([\s\S]*?)(?=Sources:|Evidence:|$)/i);
		const sourcesMatch = raw.match(/Sources:\s*([\s\S]*?)(?=Evidence:|$)/i);
		const evidenceMatch = raw.match(/Evidence:\s*([\s\S]*?)$/i);

		const sources = sourcesMatch
			? sourcesMatch[1]
					.split('\n')
					.map((s) => s.replace(/^[-*]\s*/, '').trim())
					.filter(Boolean)
			: [];

		return {
			raw,
			confidence: confidenceMatch ? confidenceMatch[1] : null,
			answer: answerMatch ? answerMatch[1].trim() : null,
			sources,
			evidence: evidenceMatch ? evidenceMatch[1].trim() : null
		};
	}

	async function handleSubmit() {
		if (!question.trim() || loading) return;

		loading = true;
		error = null;
		result = null;
		streamedText = '';

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question: question.trim() })
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

			result = parseAnswer(streamedText);
		} catch {
			error = 'Could not reach the server. Please try again.';
		} finally {
			loading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			handleSubmit();
		}
	}

	let evidenceOpen = $state(false);

	const confidenceColour: Record<string, string> = {
		High: 'bg-emerald-100 text-emerald-800',
		Medium: 'bg-amber-100 text-amber-800',
		Low: 'bg-red-100 text-red-800'
	};
</script>

<main class="min-h-screen bg-[#F7F7F5] flex flex-col items-center justify-start px-4 py-16">
	<div class="w-full max-w-2xl flex flex-col gap-8">

		<!-- Header -->
		<div class="text-center">
			<h1 class="text-3xl font-bold text-[#1A2B5F] tracking-tight">Brand Engine</h1>
			<p class="mt-2 text-sm text-[#2D2D2D]/60">Ask anything about the brand guidelines.</p>
		</div>

		<!-- Input -->
		<form onsubmit={handleSubmit} class="flex flex-col gap-3">
			<textarea
				bind:value={question}
				onkeydown={handleKeydown}
				placeholder="e.g. Can I use the logo on a dark background?"
				rows={4}
				disabled={loading}
				class="w-full rounded-xl border border-[#2D2D2D]/15 bg-white px-4 py-3 text-[#2D2D2D] text-base resize-none shadow-sm placeholder:text-[#2D2D2D]/35 focus:outline-none focus:ring-2 focus:ring-[#1A2B5F]/30 disabled:opacity-50 transition"
			></textarea>
			<div class="flex items-center justify-between">
				<span class="text-xs text-[#2D2D2D]/40">⌘ + Enter to submit</span>
				<button
					type="submit"
					disabled={loading || !question.trim()}
					class="rounded-lg bg-[#1A2B5F] px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#1A2B5F]/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
				>
					{loading ? 'Thinking…' : 'Ask'}
				</button>
			</div>
		</form>

		<!-- Error -->
		{#if error}
			<div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
				{error}
			</div>
		{/if}

		<!-- Streaming / Result -->
		{#if loading && !result}
			<div class="rounded-xl border border-[#2D2D2D]/10 bg-white px-5 py-4 text-sm text-[#2D2D2D]/50 animate-pulse">
				{streamedText || 'Reading brand documents…'}
			</div>
		{/if}

		{#if result}
			<div class="rounded-xl border border-[#2D2D2D]/10 bg-white px-5 py-5 flex flex-col gap-4 shadow-sm">

				<!-- Confidence badge -->
				{#if result.confidence}
					<div class="flex items-center gap-2">
						<span class="text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wide">Confidence</span>
						<span class="rounded-full px-2.5 py-0.5 text-xs font-semibold {confidenceColour[result.confidence] ?? 'bg-gray-100 text-gray-700'}">
							{result.confidence}
						</span>
					</div>
				{/if}

				<!-- Answer -->
				<div class="text-[#2D2D2D] text-sm leading-relaxed whitespace-pre-wrap">
					{result.answer ?? result.raw}
				</div>

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

				<!-- Evidence (expandable) -->
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

			</div>

			<!-- Original question recap -->
			<p class="text-center text-xs text-[#2D2D2D]/35">
				Question: "{question}"
			</p>
		{/if}

	</div>
</main>
