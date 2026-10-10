export type Asset = {
	id: number;
	name: string;
	size: number;
	state: string;
	browser_download_url: string;
};

export type ContractInput = {
	repository: string;
	tag: string;
	manifest: unknown;
	assets: Asset[];
	sidecars: Record<string, string>;
	allowUntaggedDraftUrls?: boolean;
};

export const requiredTargets = [
	"windows-x86_64-nsis",
	"windows-x86_64-msi",
	"linux-x86_64-appimage",
] as const;

export function validateManifest(input: ContractInput): string[] {
	const manifest = input.manifest as {
		version?: unknown;
		platforms?: Record<string, { url?: unknown; signature?: unknown }>;
	} | null;
	if (
		!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(input.tag) ||
		manifest?.version !== input.tag.slice(1)
	) {
		throw new Error("Manifest version must equal the exact tag version");
	}
	// Match tauri-action upload-version-json.ts: draft metadata may have an
	// untagged URL, but the manifest must use the exact eventual tagged URL.
	// This is URL bookkeeping, not payload signature verification.
	const publishedUrl = (asset: Asset) =>
		input.allowUntaggedDraftUrls
			? asset.browser_download_url.replace(
					/\/download\/(untagged-[^/]+)\//,
					`/download/${input.tag}/`,
				)
			: asset.browser_download_url;
	for (const asset of input.assets) {
		if (
			!Number.isSafeInteger(asset.id) ||
			asset.id <= 0 ||
			!Number.isSafeInteger(asset.size) ||
			asset.size <= 0 ||
			asset.state !== "uploaded" ||
			typeof asset.name !== "string" ||
			!asset.name ||
			publishedUrl(asset) !==
				`https://github.com/${input.repository}/releases/download/${input.tag}/${asset.name}`
		) {
			throw new Error("Invalid uploaded asset metadata");
		}
	}
	if (
		new Set(input.assets.map((asset) => asset.name)).size !== input.assets.length ||
		new Set(input.assets.map((asset) => asset.id)).size !== input.assets.length
	) {
		throw new Error("Ambiguous uploaded asset names or IDs");
	}
	const version = input.tag.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const patterns = [
		new RegExp(`^Wallpaper\\.Picker\\.UI_${version}_x64-setup\\.exe$`),
		new RegExp(`^Wallpaper\\.Picker\\.UI_${version}_x64_[A-Za-z]+-[A-Za-z]+\\.msi$`),
		new RegExp(`^Wallpaper\\.Picker\\.UI_${version}_amd64\\.AppImage$`),
	];
	for (const [index, target] of requiredTargets.entries()) {
		const candidates = input.assets.filter((asset) => patterns[index]?.test(asset.name));
		if (candidates.length !== 1)
			throw new Error(`Expected one required artifact for ${target}`);

		const entry = manifest?.platforms?.[target];
		if (
			!entry ||
			typeof entry.url !== "string" ||
			typeof entry.signature !== "string" ||
			!entry.signature
		) {
			throw new Error(`Missing or malformed exact target: ${target}`);
		}
		const payload = candidates[0];
		const expectedUrl = `https://github.com/${input.repository}/releases/download/${input.tag}/${payload?.name}`;
		if (!payload || publishedUrl(payload) !== expectedUrl || entry.url !== expectedUrl) {
			throw new Error(`Invalid exact asset URL for ${target}`);
		}
		const sidecarName = `${payload?.name}.sig`;
		const sidecars = input.assets.filter((asset) => asset.name === sidecarName);
		if (sidecars.length !== 1 || input.sidecars[sidecarName] !== entry.signature) {
			throw new Error(`Missing, ambiguous or mismatching sidecar for ${target}`);
		}
	}
	return [...requiredTargets];
}
