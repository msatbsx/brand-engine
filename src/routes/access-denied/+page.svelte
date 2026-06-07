<script lang="ts">
	import type { BrandConfig } from '$lib/brands/types.js';

	let { data } = $props<{ data: { brand: BrandConfig; contactEmail: string } }>();
	const brand = data.brand;
	const t = brand.theme;

	const cssVars = [
		`--bg:${t.bg}`,
		`--surface:${t.surface}`,
		`--text:${t.text}`,
		`--text-muted:${t.textMuted}`,
		`--border:${t.border}`,
		`--btn-gradient:${t.btnGradient}`,
		`--accent:${t.accent}`,
		`--font-sans:${t.fontSans}`,
		`--font-label:${t.fontLabel}`
	].join(';');
</script>

<main
	class="min-h-screen flex flex-col items-center justify-center px-4 py-12"
	style="{cssVars}; background: var(--bg)"
>
	<div class="w-full max-w-md flex flex-col items-center gap-8">

		<!-- Logo + Brand Guru -->
		<header class="flex flex-col items-center gap-2.5">
			{#if brand.logoUrl}
				<img src={brand.logoUrl} alt={brand.logoAlt} class="{brand.logoHeight ?? 'h-14'} w-auto object-contain" />
			{:else}
				<span
					class="text-2xl font-semibold uppercase tracking-[0.06em]"
					style="color: var(--text); font-family: var(--font-label)"
				>
					{brand.name}
				</span>
			{/if}
			<span
				class="font-semibold text-3xl uppercase tracking-[0.06em]"
				style="color: var(--text); font-family: var(--font-label)"
			>
				Brand Guru
			</span>
		</header>

		<!-- Access denied card -->
		<div
			class="w-full rounded-2xl border px-8 py-10 flex flex-col items-center gap-5 text-center"
			style="background: var(--surface); border-color: var(--border)"
		>
			<!-- Lock icon -->
			<div
				class="w-14 h-14 rounded-full flex items-center justify-center"
				style="background: var(--btn-gradient)"
			>
				<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
					/>
				</svg>
			</div>

			<div class="flex flex-col gap-2">
				<h1
					class="text-2xl font-semibold uppercase tracking-[0.06em]"
					style="color: var(--text); font-family: var(--font-label)"
				>
					Access denied
				</h1>
				<p class="text-base leading-relaxed" style="color: var(--text-muted); font-family: var(--font-sans)">
					This Brand Guru preview is currently private.
				</p>
			</div>

			{#if data.contactEmail}
				<div
					class="w-full border-t pt-5 flex flex-col gap-1.5"
					style="border-color: var(--border)"
				>
					<p class="text-sm" style="color: var(--text-muted); font-family: var(--font-sans)">
						If you need access, please contact:
					</p>
					<a
						href="mailto:{data.contactEmail}"
						class="text-sm font-semibold transition-opacity hover:opacity-70"
						style="color: var(--accent); font-family: var(--font-sans)"
					>
						{data.contactEmail}
					</a>
				</div>
			{/if}
		</div>

		<p class="text-xs" style="color: var(--text-muted); opacity: 0.5; font-family: var(--font-sans)">
			Private preview environment
		</p>

	</div>
</main>
