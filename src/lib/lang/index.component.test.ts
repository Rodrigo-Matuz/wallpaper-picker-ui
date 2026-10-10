import { get } from "svelte/store";
import { afterEach, expect, it, vi } from "vitest";
import { applicationWork } from "$utils/applicationWork/applicationWork";
import { currentLanguage, setLanguage } from "./index";

const { updateConfig, errorToast } = vi.hoisted(() => ({
	updateConfig: vi.fn(async (_config: object) => true),
	errorToast: vi.fn((_message: string) => {}),
}));
vi.mock("$api/config/update/update", () => ({ updateConfig }));
vi.mock("svelte-sonner", () => ({ toast: { error: errorToast } }));
afterEach(() => {
	currentLanguage.set("eng");
	vi.clearAllMocks();
});

it("publishes language only after confirmed persistence and retains it on reported failure", async () => {
	updateConfig.mockResolvedValueOnce(false);
	expect(await setLanguage("pt-br")).toBe(false);
	expect(get(currentLanguage)).toBe("eng");
	expect(errorToast).toHaveBeenCalledTimes(1);
	expect(await setLanguage("pt-br")).toBe(true);
	expect(get(currentLanguage)).toBe("pt-br");
	expect(applicationWork.hasPendingWork()).toBe(false);
});

it("denies language selection while reserved without publishing or floating rejection", async () => {
	const reservation = applicationWork.tryReserveInstall();
	expect(reservation).not.toBeNull();
	try {
		await setLanguage("pt-br");
		expect(get(currentLanguage)).toBe("eng");
		expect(updateConfig).not.toHaveBeenCalled();
		expect(errorToast).toHaveBeenCalledTimes(1);
	} finally {
		reservation?.release();
	}
});
