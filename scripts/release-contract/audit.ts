import {
	type Asset,
	assertNoMsiAssets,
	assertNoMsiPlatforms,
	requiredTargets,
	validateManifest,
} from "./contract";

export type ReadGitHub = (path: string, limit: number, asset?: boolean) => Promise<string>;

function expectedDownloadUrl(repository: string, tag: string, name: string) {
	return `https://github.com/${repository}/releases/download/${tag}/${name}`;
}

function assetForManifestUrl(url: string, repository: string, tag: string, assets: Asset[]) {
	// Draft tauri-action metadata can reference API asset URLs while the
	// GitHub release metadata still exposes an untagged browser URL.
	const apiPrefix = `https://api.github.com/repos/${repository}/releases/assets/`;
	if (url.startsWith(apiPrefix)) {
		const idText = url.slice(apiPrefix.length);
		if (!/^[1-9]\d*$/.test(idText)) throw new Error("Malformed draft asset URL");
		const id = Number(idText);
		if (!Number.isSafeInteger(id)) throw new Error("Invalid draft asset ID");
		const asset = assets.find((candidate) => candidate.id === id);
		if (!asset) throw new Error("Draft asset URL does not reference an uploaded asset");
		return asset;
	}

	return assets.find(
		(asset) =>
			asset.browser_download_url.replace(
				/\/download\/(untagged-[^/]+)\//,
				`/download/${tag}/`,
			) === url,
	);
}

function normalizeDraftManifest(
	manifest: unknown,
	repository: string,
	tag: string,
	assets: Asset[],
) {
	if (!manifest || typeof manifest !== "object") return manifest;
	const source = manifest as {
		platforms?: Record<string, { url?: unknown; signature?: unknown }>;
	};
	const platforms = Object.fromEntries(
		Object.entries(source.platforms ?? {}).map(([target, entry]) => {
			if (typeof entry?.url !== "string") return [target, entry];
			const asset = assetForManifestUrl(entry.url, repository, tag, assets);
			return [
				target,
				asset ? { ...entry, url: expectedDownloadUrl(repository, tag, asset.name) } : entry,
			];
		}),
	);
	return { ...manifest, platforms };
}

function assertTextAsset(asset: Asset, limit: number) {
	if (
		!Number.isSafeInteger(asset.id) ||
		asset.id <= 0 ||
		asset.state !== "uploaded" ||
		!Number.isSafeInteger(asset.size) ||
		asset.size <= 0 ||
		asset.size > limit
	) {
		throw new Error("Expected bounded uploaded text asset metadata");
	}
}

async function readPages<T>(path: string, read: ReadGitHub, maxPages: number): Promise<T[]> {
	const result: T[] = [];
	for (let page = 1; page <= maxPages; page++) {
		const batch: unknown = JSON.parse(
			await read(`${path}?per_page=100&page=${page}`, 1_048_576),
		);
		if (
			!Array.isArray(batch) ||
			batch.length > 100 ||
			batch.some((item) => !item || typeof item !== "object")
		)
			throw new Error("Invalid metadata page");
		result.push(...batch);
		if (batch.length < 100) return result;
	}
	throw new Error("Metadata pagination exceeded bound");
}

export async function auditDraft(repository: string, tag: string, read: ReadGitHub) {
	if (
		!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
		repository.split("/").some((part) => part === "." || part === "..") ||
		!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)
	) {
		throw new Error("Invalid repository or tag");
	}
	const base = `/repos/${repository}`;
	const releases = await readPages<{
		id: number;
		tag_name: string;
		draft: boolean;
		prerelease: boolean;
	}>(`${base}/releases`, read, 10);
	const matches = releases.filter((release) => release.tag_name === tag);
	if (matches.length > 1) throw new Error("Ambiguous release tag");
	const release = matches[0];
	if (!release) throw new Error("Release not found");
	if (
		release.draft !== true ||
		release.prerelease !== false ||
		!Number.isSafeInteger(release.id) ||
		release.id <= 0
	) {
		throw new Error("Expected one non-prerelease draft with a valid release ID");
	}
	const assets = await readPages<Asset>(`${base}/releases/${release.id}/assets`, read, 5);
	assertNoMsiAssets(assets);
	if (
		new Set(assets.map((asset) => asset.name)).size !== assets.length ||
		new Set(assets.map((asset) => asset.id)).size !== assets.length
	) {
		throw new Error("Ambiguous release assets");
	}
	const manifestAsset = assets.find((asset) => asset.name === "latest.json");
	if (!manifestAsset) throw new Error("Missing latest.json");
	assertTextAsset(manifestAsset, 1_048_576);
	const manifest = JSON.parse(
		await read(`${base}/releases/assets/${manifestAsset.id}`, 1_048_576, true),
	);
	assertNoMsiPlatforms(manifest?.platforms);
	const sidecars: Record<string, string> = {};
	for (const target of requiredTargets) {
		const url = manifest?.platforms?.[target]?.url;
		if (typeof url !== "string") throw new Error(`Missing exact target ${target}`);
		const payload = assetForManifestUrl(url, repository, tag, assets);
		if (!payload) throw new Error(`Missing uploaded payload for ${target}`);
		const name = `${payload.name}.sig`;
		const sidecar = assets.find((asset) => asset.name === name);
		if (!sidecar) throw new Error(`Missing sidecar for ${target}`);
		assertTextAsset(sidecar, 16_384);
		sidecars[name] = await read(`${base}/releases/assets/${sidecar.id}`, 16_384, true);
	}
	const targets = validateManifest({
		repository,
		tag,
		manifest: normalizeDraftManifest(manifest, repository, tag, assets),
		assets,
		sidecars,
		allowUntaggedDraftUrls: true,
	});
	return { releaseId: release.id, tag, targets };
}
