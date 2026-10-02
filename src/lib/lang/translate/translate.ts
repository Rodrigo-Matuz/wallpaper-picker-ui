export type LanguageRegistry = Record<string, { name: string; data: Record<string, string> }>;

/** Resolve a key through exact locale, base locale, English, then the key itself. */
export function resolveTranslation(
	languages: LanguageRegistry,
	language: string,
	key: string,
): string {
	const exact = languages[language]?.data[key];
	if (exact) return exact;

	const base = languages[language.split("-")[0]]?.data[key];
	if (base) return base;

	return languages.eng?.data[key] ?? key;
}
