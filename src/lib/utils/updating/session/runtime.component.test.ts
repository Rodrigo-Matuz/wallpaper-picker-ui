import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	native: vi.fn(() => true),
	read: vi.fn(async () => ({ language: "pt-br" })),
	write: vi.fn(),
	check: vi.fn<() => Promise<unknown>>(async () => undefined),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: mocks.native }));
vi.mock("$api/config/read/read", () => ({ fetchConfig: mocks.read }));
vi.mock("$api/config/update/update", () => ({ updateConfig: mocks.write }));
vi.mock("$utils/updating/updating", () => ({
	updaterController: { checkForUpdates: mocks.check },
}));

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocks.native.mockReturnValue(true);
	mocks.read.mockResolvedValue({ language: "pt-br" });
	mocks.check.mockImplementation(async () => undefined);
	vi.stubEnv("DEV", false);
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("application language bootstrap (synthetic native runtime)", () => {
	it("loads stored language once before the nonblocking production-native check without persistence", async () => {
		const runtime = await import("./runtime");
		const { currentLanguage } = await import("$lang/index");
		let ready!: (value: { language: string }) => void;
		mocks.read.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					ready = resolve;
				}),
		);
		mocks.check.mockImplementation(() => {
			expect(get(currentLanguage)).toBe("pt-br");
			expect(get(runtime.languageReady)).toBe(true);
			return new Promise(() => {});
		});
		const initialization = runtime.initializeApplicationSession();
		expect(mocks.check).not.toHaveBeenCalled();
		const joined = runtime.initializeApplicationSession();
		expect(joined).toBe(initialization);
		ready({ language: "pt-br" });
		await initialization;
		expect(mocks.read).toHaveBeenCalledTimes(1);
		expect(mocks.check).toHaveBeenCalledTimes(1);
		expect(mocks.write).not.toHaveBeenCalled();
	});

	it.each([
		false,
		true,
	])("never calls the updater in browser/development (native=%s)", async (native) => {
		mocks.native.mockReturnValue(native);
		vi.stubEnv("DEV", true);
		const runtime = await import("./runtime");
		await runtime.initializeApplicationSession();
		expect(mocks.check).not.toHaveBeenCalled();
		expect(get(runtime.languageReady)).toBe(true);
		expect(get(runtime.runtimeMode)).toBe(native ? "development" : "browser");
		expect(mocks.write).not.toHaveBeenCalled();
	});

	it("does no config, runtime detection or updater work during SSR", async () => {
		const runtime = await import("./runtime");
		vi.stubGlobal("window", undefined);
		await runtime.initializeApplicationSession();
		expect(mocks.native).not.toHaveBeenCalled();
		expect(mocks.read).not.toHaveBeenCalled();
		expect(mocks.check).not.toHaveBeenCalled();
	});

	it.each([
		"missing-language",
		"__proto__",
	])("ignores unregistered stored language %s without rewriting configuration", async (language) => {
		mocks.read.mockResolvedValue({ language });
		const runtime = await import("./runtime");
		const { currentLanguage } = await import("$lang/index");
		await runtime.initializeApplicationSession();
		expect(get(currentLanguage)).toBe("eng");
		expect(mocks.write).not.toHaveBeenCalled();
		expect(mocks.check).toHaveBeenCalledTimes(1);
	});

	it("continues with registered default language after config read rejection", async () => {
		mocks.read.mockRejectedValueOnce(new Error("unavailable config"));
		const runtime = await import("./runtime");
		const { currentLanguage } = await import("$lang/index");
		await runtime.initializeApplicationSession();
		expect(get(currentLanguage)).toBe("eng");
		expect(get(runtime.languageReady)).toBe(true);
		expect(mocks.check).toHaveBeenCalledTimes(1);
		expect(mocks.write).not.toHaveBeenCalled();
	});
});
