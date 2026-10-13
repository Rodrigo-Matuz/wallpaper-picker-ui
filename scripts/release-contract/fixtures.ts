export function fixture() {
	const repository = "Rodrigo-Matuz/wallpaper-picker-ui";
	const tag = "v9.8.7";
	const names = {
		"windows-x86_64-nsis": "Wallpaper.Picker.UI_9.8.7_x64-setup.exe",
		"linux-x86_64-appimage": "Wallpaper.Picker.UI_9.8.7_amd64.AppImage",
	};
	let id = 1;
	const asset = (name: string) => ({
		id: id++,
		name,
		size: 123,
		state: "uploaded",
		browser_download_url: `https://github.com/${repository}/releases/download/${tag}/${name}`,
	});
	const assets = [asset("latest.json")];
	const platforms: Record<string, { url: string; signature: string }> = {};
	const sidecars: Record<string, string> = {};
	for (const [target, name] of Object.entries(names)) {
		const payload = asset(name);
		assets.push(payload, asset(`${name}.sig`));
		const signature = `synthetic-sidecar-${target}\n`;
		platforms[target] = { url: payload.browser_download_url, signature };
		sidecars[`${name}.sig`] = signature;
	}
	platforms["windows-x86_64"] = { ...platforms["windows-x86_64-nsis"] };
	assets.push(
		asset("Wallpaper.Picker.UI_9.8.7_amd64.deb"),
		asset("Wallpaper.Picker.UI-9.8.7-1.x86_64.rpm"),
	);
	return { repository, tag, manifest: { version: "9.8.7", platforms }, assets, sidecars };
}

export const forbiddenMsiPlatforms = [
	["windows-x86_64-msi", "https://example.com/legacy.exe"],
	["windows-x86_64-MSI", "https://example.com/legacy.exe"],
	["windows-x86_64", "https://example.com/legacy.msi"],
	["windows-x86_64-other", "https://example.com/legacy.MSI"],
	["linux-x86_64-other", "https://example.com/legacy.MsI.SiG"],
	["windows-x86_64-other", "https://example.com/legacy.msi?download=1"],
	["windows-x86_64-other", "https://example.com/legacy%2e%6d%73%69"],
] as const;
