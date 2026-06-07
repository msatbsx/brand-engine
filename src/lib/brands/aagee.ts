import type { BrandConfig } from './types.js';

const aagee: BrandConfig = {
	id: 'aagee',
	name: 'Aagee',
	logoUrl: '/brand/aagee/logo-primary.png',
	logoAlt: 'Aagee logo',
	logoHeight: 'h-28',
	introText: "Ask me anything about the Aagee brand — logo usage, colour, typography, tone of voice, and compliance.",
	accentColor: '#DDFB66',
	questions: [
		'What are the approved logo colour combinations?',
		'What is the minimum logo size rule?',
		'What fonts are used in the Aagee brand?',
		'What is the clear space rule around the logo?',
		'Which logo versions are approved for digital use?',
		'What is the tone of voice for Aagee communications?'
	],
	guidelinePages: true,
	theme: {
		bg: '#131F30',
		surface: 'rgba(255,255,255,0.07)',
		text: '#FFFFFF',
		textMuted: 'rgba(255,255,255,0.5)',
		placeholder: 'rgba(255,255,255,0.3)',
		browse: 'rgba(255,255,255,0.65)',
		border: 'rgba(255,255,255,0.13)',
		gridBorder: 'rgba(255,255,255,0.13)',
		btnGradient: 'linear-gradient(135deg, #9CEE95 0%, #DDFB66 100%)',
		hoverGradient: 'linear-gradient(135deg, rgba(221,251,102,0.12) 0%, rgba(156,238,149,0.12) 100%)',
		accent: '#DDFB66',
		accentBg: 'rgba(221,251,102,0.12)',
		accentFg: '#DDFB66',
		dragBorder: '#DDFB66',
		dragBg: 'rgba(221,251,102,0.05)',
		fontSans: "'Figtree', sans-serif",
		fontLabel: "'Figtree', sans-serif",
		fontSubtitle: "'Figtree', sans-serif",
		subtitleStyle: 'normal',
		proseInvert: true
	}
};

export default aagee;
