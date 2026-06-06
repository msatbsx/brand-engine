export interface BrandTheme {
	bg: string;
	surface: string;
	text: string;
	textMuted: string;
	placeholder: string;
	browse: string;
	border: string;
	gridBorder: string;
	btnGradient: string;
	hoverGradient: string;
	accent: string;
	accentBg: string;
	accentFg: string;
	dragBorder: string;
	dragBg: string;
	fontSans: string;
	fontLabel: string;
	fontSubtitle: string;
	subtitleStyle: 'italic' | 'normal';
	proseInvert: boolean;
}

export interface BrandConfig {
	id: string;
	name: string;
	logoUrl: string | null;
	logoAlt: string;
	introText: string;
	accentColor: string;
	questions: [string, string, string, string, string, string];
	guidelinePages: boolean;
	theme: BrandTheme;
}
