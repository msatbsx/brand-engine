import type { BrandConfig } from './types.js';

const cprime: BrandConfig = {
	id: 'cprime',
	name: 'Cprime',
	logoUrl: '/brand/cprime/logo-primary.png',
	logoAlt: 'Cprime logo',
	introText: "I'm here to help you make the best Cprime brand assets. Ask me anything about identity, messaging, design, or execution to get instant guidance.",
	accentColor: '#E739F0',
	questions: [
		'What are the rules for using icons, illustrations, and graphic elements?',
		'Do you have examples of good headline writing for Cprime?',
		'Where do I find the latest logos, templates, and brand assets?',
		'What should a LinkedIn post from our brand look and sound like?',
		'What fonts do I use for Cprime headlines?',
		'How do I use the Cprime logo with partner logos?'
	],
	guidelinePages: true,
	theme: {
		bg: '#f8f6ef',
		surface: '#ffffff',
		text: '#161616',
		textMuted: 'rgba(22,22,22,0.5)',
		placeholder: '#b3b3b3',
		browse: '#7a7a7a',
		border: '#d3d3d3',
		gridBorder: 'rgba(133,133,133,0.77)',
		btnGradient: 'linear-gradient(135deg, #FF8E3C 0%, #E739F0 100%)',
		hoverGradient: 'linear-gradient(244deg, rgba(231,57,240,0.5) 23.364%, rgba(251,242,223,0.5) 100.42%)',
		accent: '#E739F0',
		accentBg: 'rgba(231,57,240,0.1)',
		accentFg: '#c020cc',
		dragBorder: '#E739F0',
		dragBg: 'rgba(231,57,240,0.05)',
		fontSans: "'Barlow', sans-serif",
		fontLabel: "'Barlow Condensed', sans-serif",
		fontSubtitle: "'Noto Serif Display', serif",
		subtitleStyle: 'normal',
		proseInvert: false
	}
};

export default cprime;
