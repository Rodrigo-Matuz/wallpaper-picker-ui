import { expect, test } from "bun:test";
import { validateManifest } from "./contract";
import { fixture, forbiddenMsiPlatforms } from "./fixtures";

test("accepts the action's documented untagged draft URL mapping only when explicitly auditing a draft", () => {
	const input = fixture();
	for (const asset of input.assets)
		asset.browser_download_url = asset.browser_download_url.replace(
			"/v9.8.7/",
			"/untagged-synthetic/",
		);
	expect(validateManifest({ ...input, allowUntaggedDraftUrls: true })).toEqual([
		"windows-x86_64-nsis",
		"linux-x86_64-appimage",
	]);
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
		input.manifest.platforms["linux-x86_64-appimage"].url;
	expect(() => validateManifest(input)).toThrow("URL");
});

test("rejects a missing required uploaded installer", () => {
	const input = fixture();
	input.assets = input.assets.filter((asset) => !asset.name.endsWith("-setup.exe"));
	expect(() => validateManifest(input)).toThrow("artifact");
});

test("rejects a missing exact installer target even when a generic Windows alias exists", () => {
	const input = fixture();
	delete input.manifest.platforms["windows-x86_64-nsis"];
	expect(() => validateManifest(input)).toThrow("windows-x86_64-nsis");
});

test("rejects a manifest version different from the literal release tag", () => {
	const input = fixture();
	input.manifest.version = "9.8.6";
	expect(() => validateManifest(input)).toThrow("version");
});

test.each([
	"legacy.msi",
	"legacy.MSI",
	"legacy.msi.sig",
	"legacy.MsI.SiG",
])("rejects any uploaded MSI asset %s without repairing the input", (name) => {
	const input = fixture();
	input.assets.push({
		...input.assets[1],
		id: 999,
		name,
		browser_download_url: `https://github.com/${input.repository}/releases/download/${input.tag}/${name}`,
	});
	const before = structuredClone(input);
	expect(() => validateManifest(input)).toThrow("MSI");
	expect(input).toEqual(before);
});

test.each(
	forbiddenMsiPlatforms,
)("rejects MSI platform key or URL %s %s without repairing the manifest", (target, url) => {
	const input = fixture();
	input.manifest.platforms[target] = { url, signature: "synthetic" };
	const before = structuredClone(input);
	expect(() => validateManifest(input)).toThrow("MSI");
	expect(input).toEqual(before);
});

test.each([
	"missing",
	"URL",
	"signature",
	"empty signature",
])("rejects a generic Windows alias with %s instead of the exact NSIS payload", (reason) => {
	const input = fixture();
	if (reason === "missing") delete input.manifest.platforms["windows-x86_64"];
	else if (reason === "URL")
		input.manifest.platforms["windows-x86_64"].url =
			input.manifest.platforms["linux-x86_64-appimage"].url;
	else
		input.manifest.platforms["windows-x86_64"].signature =
			reason === "empty signature" ? "" : "different-signature";
	const before = structuredClone(input);
	expect(() => validateManifest(input)).toThrow("Windows alias");
	expect(input).toEqual(before);
});

test("accepts the two exact updater targets with NSIS alias and Linux package assets", () => {
	expect(validateManifest(fixture())).toEqual(["windows-x86_64-nsis", "linux-x86_64-appimage"]);
});
