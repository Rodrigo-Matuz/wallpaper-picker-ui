import { expect, test } from "bun:test";
import { validateManifest } from "./contract";
import { fixture } from "./fixtures";

test("accepts the action's documented untagged draft URL mapping only when explicitly auditing a draft", () => {
	const input = fixture();
	for (const asset of input.assets)
		asset.browser_download_url = asset.browser_download_url.replace(
			"/v9.8.7/",
			"/untagged-synthetic/",
		);
	expect(validateManifest({ ...input, allowUntaggedDraftUrls: true })).toHaveLength(3);
	expect(() => validateManifest(input)).toThrow("metadata");
});

test("rejects assets not successfully uploaded with nonempty bounded metadata", () => {
	const input = fixture();
	input.assets[1].state = "starter";
	expect(() => validateManifest(input)).toThrow("uploaded");
});

test("rejects ambiguous asset metadata even outside the selected installer", () => {
	const input = fixture();
	input.assets.push({ ...input.assets[0], id: 999 });
	expect(() => validateManifest(input)).toThrow("Ambiguous");
});

test("rejects sidecar text that differs from the manifest signature", () => {
	const input = fixture();
	input.sidecars["Wallpaper.Picker.UI_9.8.7_x64-setup.exe.sig"] += "changed";
	expect(() => validateManifest(input)).toThrow("sidecar");
});

test("rejects a URL not equal to the actual matching uploaded installer URL", () => {
	const input = fixture();
	input.manifest.platforms["windows-x86_64-nsis"].url =
		input.manifest.platforms["windows-x86_64-msi"].url;
	expect(() => validateManifest(input)).toThrow("URL");
});

test("rejects a missing required uploaded installer", () => {
	const input = fixture();
	input.assets = input.assets.filter((asset) => !asset.name.endsWith(".msi"));
	expect(() => validateManifest(input)).toThrow("artifact");
});

test("rejects a missing exact installer target even when a generic Windows alias exists", () => {
	const input = fixture();
	input.manifest.platforms["windows-x86_64"] = input.manifest.platforms["windows-x86_64-msi"];
	delete input.manifest.platforms["windows-x86_64-msi"];
	expect(() => validateManifest(input)).toThrow("windows-x86_64-msi");
});

test("rejects a manifest version different from the literal release tag", () => {
	const input = fixture();
	input.manifest.version = "9.8.6";
	expect(() => validateManifest(input)).toThrow("version");
});

test("accepts exact three installer entries tied to uploaded assets and sidecars", () => {
	expect(validateManifest(fixture())).toEqual([
		"windows-x86_64-nsis",
		"windows-x86_64-msi",
		"linux-x86_64-appimage",
	]);
});
