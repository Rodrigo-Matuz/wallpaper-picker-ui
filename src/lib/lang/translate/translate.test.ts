import { describe, expect, test } from "bun:test";
import { type LanguageRegistry, resolveTranslation } from "./translate";

const languages: LanguageRegistry = {
	eng: { name: "English", data: { greeting: "Hello", farewell: "Goodbye", shared: "English" } },
	pt: { name: "Português", data: { greeting: "Olá", shared: "Portuguese" } },
	"pt-br": { name: "Português (Brasil)", data: { shared: "Brazilian" } },
};

describe("resolveTranslation", () => {
	test("prefers the exact regional translation over the base language", () => {
		expect(resolveTranslation(languages, "pt-br", "shared")).toBe("Brazilian");
	});

	test("falls back to the base language when a regional key is absent", () => {
		expect(resolveTranslation(languages, "pt-br", "greeting")).toBe("Olá");
	});

	test("falls back to English for untranslated keys", () => {
		expect(resolveTranslation(languages, "pt-br", "farewell")).toBe("Goodbye");
	});

	test("uses English for an unknown language", () => {
		expect(resolveTranslation(languages, "unknown", "greeting")).toBe("Hello");
	});

	test("returns the key when it is missing in every language", () => {
		expect(resolveTranslation(languages, "pt-br", "missing.key")).toBe("missing.key");
	});

	test("treats empty translations as absent", () => {
		const registry: LanguageRegistry = {
			...languages,
			"pt-br": { name: "Português (Brasil)", data: { greeting: "" } },
		};
		expect(resolveTranslation(registry, "pt-br", "greeting")).toBe("Olá");
	});
});
