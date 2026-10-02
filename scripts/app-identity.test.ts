import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const config = JSON.parse(
	readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);

test("display name and window title are human-readable", () => {
	expect(config.productName).toBe("Wallpaper Picker UI");
	expect(config.app.windows[0].title).toBe("Wallpaper Picker UI");
});

test("binary and existing Windows installer identity stay stable", () => {
	expect(config.mainBinaryName).toBe("wallpaper-picker-ui");
	expect(config.identifier).toBe("dev.matuz.wallpaper-picker-ui");
	expect(config.bundle.windows.wix.upgradeCode).toBe("83118bd9-967b-5a1f-94be-e18868474288");
});
