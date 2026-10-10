import { get } from "svelte/store";
import { afterEach, expect, test, vi } from "vitest";
import { currentLanguage, languages, t } from "$lang/index";
import { runSettingsAction } from "./actions";

const { errorToast } = vi.hoisted(() => ({ errorToast: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: { error: errorToast } }));
vi.mock("$api/config/update/update", () => ({ updateConfig: vi.fn() }));

afterEach(() => {
	currentLanguage.set("eng");
	vi.clearAllMocks();
});

test.each(
	[...Object.keys(languages), "unknown-locale"].flatMap((locale) =>
		["toast.settings.failed", "toast.folder.failed"].map((key) => ({ locale, key })),
	),
)("$key resolves instead of displaying a key in $locale", async ({ locale, key }) => {
	currentLanguage.set(locale);
	{
		const message = get(t)(key);
		expect(message).not.toBe(key);
		expect(message.trim()).not.toBe("");
		if (languages[locale]) expect(message).toBe(languages[locale].data[key]);
		else expect(message).toBe(languages.eng.data[key]);
	}
	expect(await runSettingsAction(() => false)).toBe(false);
	expect(errorToast).toHaveBeenCalledWith(get(t)("toast.settings.failed"));
});
