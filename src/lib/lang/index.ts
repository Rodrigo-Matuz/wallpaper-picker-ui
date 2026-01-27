import { get, writable, derived } from "svelte/store";
import { updateConfig } from "$api/config/update";

/** DOCS:
 * Represents the expected structure of a translation JSON file.
 *
 * Each translation file must declare:
 * - a unique language `code` (e.g. "eng", "pt-br")
 * - a human-readable `name`
 * - a `translations` object containing key-value string pairs
 */
type TranslationFile = {
	code: string;
	name: string;
	translations: Record<string, string>;
};

/** DOCS:
 * Dynamically imports all translation JSON files from the `translations` directory.
 *
 * Uses Vite's `import.meta.glob` with eager loading so all translations
 * are available at application startup.
 */
const translationModules = import.meta.glob<TranslationFile>(
	"./translations/*.json",
	{ eager: true }
);

/** DOCS:
 * In-memory registry of all available languages.
 *
 * The key is the language code (e.g. "eng", "pt-br").
 * Each entry contains the display name and translation key-value pairs.
 */
const languages: Record<string, { name: string; data: Record<string, string> }> = {};

/** DOCS:
 * Populates the `languages` registry using the loaded translation modules.
 *
 * Each JSON file contributes one language entry keyed by its declared `code`.
 */
for (const mod of Object.values(translationModules)) {
	languages[mod.code] = {
		name: mod.name,
		data: mod.translations
	};
}

/** DOCS:
 * Reactive store holding the currently selected application language.
 *
 * The value should match one of the loaded language codes.
 * Defaults to English ("eng").
 */
export const currentLanguage = writable<string>("eng");

/** DOCS:
 * Updates the active application language.
 *
 * If the provided language code exists, the language store is updated
 * and the selection is persisted to the configuration file.
 *
 * Invalid or unknown language codes are ignored.
 *
 * @param lang - Language code to activate (e.g. "eng", "pt-br").
 *
 * @example
 * ```ts
 * setLanguage("pt-br");
 * ```
 */
export function setLanguage(lang: string) {
	if (!languages[lang]) return;
	currentLanguage.set(lang);
	updateConfig({ language: lang });
}

/** DOCS:
 * Reactive translation resolver bound to the current application language.
 *
 * This is a derived Svelte store that exposes a translation function.
 * It automatically re-evaluates when `currentLanguage` changes,
 * causing any consuming components to re-render without a page reload.
 *
 * Resolution order:
 * 1. Exact language match (e.g. "pt-br")
 * 2. Regional fallback (e.g. "pt-br" → "pt")
 * 3. Final fallback to English ("eng")
 * 4. Returns the key itself if no translation is found
 *
 * This ensures graceful behavior even with incomplete translations.
 *
 * @returns A translation function that resolves a key to a localized string.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { t } from "$lang";
 * </script>
 *
 * <h1>{$t("settingsLanguageName")}</h1>
 * ```
 */
export const t = derived(currentLanguage, ($lang) => {
	return (key: string) => {
		if (languages[$lang]?.data[key]) {
			return languages[$lang].data[key];
		}

		const base = $lang.split("-")[0];
		if (languages[base]?.data[key]) {
			return languages[base].data[key];
		}

		return languages.eng?.data[key] ?? key;
	};
});

export { languages };