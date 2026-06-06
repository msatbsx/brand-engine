export interface BrandConfig {
	id: string;
	name: string;
	logoUrl: string | null;
	logoAlt: string;
	introText: string;
	accentColor: string;
	questions: [string, string, string, string, string, string];
}
