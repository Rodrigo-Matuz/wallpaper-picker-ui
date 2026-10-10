export function fixture() {
	const repository = "Rodrigo-Matuz/wallpaper-picker-ui";
	const tag = "v9.8.7";
	const names = {
		"windows-x86_64-nsis": "Wallpaper.Picker.UI_9.8.7_x64-setup.exe",
		"windows-x86_64-msi": "Wallpaper.Picker.UI_9.8.7_x64_en-US.msi",
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
	return { repository, tag, manifest: { version: "9.8.7", platforms }, assets, sidecars };
}
