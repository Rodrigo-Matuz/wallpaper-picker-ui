import { expect, test } from "bun:test";
import { auditDraft } from "./audit";
import { fixture, forbiddenMsiPlatforms } from "./fixtures";

test("refuses dot-segment repositories before building authenticated API paths", async () => {
	let calls = 0;
	await expect(
		auditDraft("Owner/..", "v9.8.7", async () => {
			calls++;
			return "[]";
		}),
	).rejects.toThrow("repository or tag");
	expect(calls).toBe(0);
});

test("rejects malformed repository or tag before any network request", async () => {
	for (const [repository, tag] of [
		["Owner/repo/extra", "v9.8.7"],
		["Owner/repo", "9.8.7"],
		["Owner/repo", "v9.8.7/extra"],
	]) {
		let calls = 0;
		await expect(
			auditDraft(repository, tag, async () => {
				calls++;
				return "[]";
			}),
		).rejects.toThrow("repository or tag");
		expect(calls).toBe(0);
	}
});

test("refuses oversized manifest metadata without fetching its body", async () => {
	let calls = 0;
	await expect(
		auditDraft("Rodrigo-Matuz/wallpaper-picker-ui", "v9.8.7", async (path) => {
			calls++;
			if (path.includes("/releases?"))
				return JSON.stringify([
					{ id: 42, tag_name: "v9.8.7", draft: true, prerelease: false },
				]);
			return JSON.stringify([
				{ id: 1, name: "latest.json", size: 2_000_000, state: "uploaded" },
			]);
		}),
	).rejects.toThrow("bounded");
	expect(calls).toBe(2);
});

test("reads bounded release pages and refuses duplicate draft tags", async () => {
	const calls: string[] = [];
	await expect(
		auditDraft("Rodrigo-Matuz/wallpaper-picker-ui", "v9.8.7", async (path) => {
			calls.push(path);
			return JSON.stringify(
				path.endsWith("page=1")
					? Array.from({ length: 100 }, (_, id) => ({
							id: id + 1,
							tag_name: "v9.8.7",
							draft: true,
							prerelease: false,
						}))
					: [],
			);
		}),
	).rejects.toThrow("Ambiguous");
	expect(calls).toHaveLength(2);
});

test("refuses a published release before reading assets", async () => {
	await expect(
		auditDraft("Rodrigo-Matuz/wallpaper-picker-ui", "v9.8.7", async () =>
			JSON.stringify([{ id: 42, tag_name: "v9.8.7", draft: false, prerelease: false }]),
		),
	).rejects.toThrow("draft");
});

test.each([
	"legacy.msi",
	"legacy.MSI",
	"legacy.msi.sig",
	"legacy.MsI.SiG",
])("refuses MSI asset %s from metadata before fetching any asset body", async (name) => {
	const input = fixture();
	input.assets.push({
		...input.assets[1],
		id: 999,
		name,
		browser_download_url: `https://github.com/${input.repository}/releases/download/${input.tag}/${name}`,
	});
	const before = structuredClone(input);
	const paths: string[] = [];
	await expect(
		auditDraft(input.repository, input.tag, async (path) => {
			paths.push(path);
			if (path.includes("/releases?"))
				return JSON.stringify([
					{ id: 42, tag_name: input.tag, draft: true, prerelease: false },
				]);
			if (path.includes("/releases/42/assets?")) return JSON.stringify(input.assets);
			throw new Error("Forbidden asset body fetch");
		}),
	).rejects.toThrow("MSI");
	expect(paths).toEqual([
		`/repos/${input.repository}/releases?per_page=100&page=1`,
		`/repos/${input.repository}/releases/42/assets?per_page=100&page=1`,
	]);
	expect(input).toEqual(before);
});

test.each(
	forbiddenMsiPlatforms,
)("refuses MSI platform key or URL %s %s before fetching any sidecar", async (target, url) => {
	const input = fixture();
	input.manifest.platforms[target] = { url, signature: "synthetic" };
	const before = structuredClone(input);
	const paths: string[] = [];
	await expect(
		auditDraft(input.repository, input.tag, async (path) => {
			paths.push(path);
			if (path.includes("/releases?"))
				return JSON.stringify([
					{ id: 42, tag_name: input.tag, draft: true, prerelease: false },
				]);
			if (path.includes("/releases/42/assets?")) return JSON.stringify(input.assets);
			if (path === `/repos/${input.repository}/releases/assets/1`)
				return JSON.stringify(input.manifest);
			throw new Error("Forbidden sidecar fetch");
		}),
	).rejects.toThrow("MSI");
	expect(paths).toEqual([
		`/repos/${input.repository}/releases?per_page=100&page=1`,
		`/repos/${input.repository}/releases/42/assets?per_page=100&page=1`,
		`/repos/${input.repository}/releases/assets/1`,
	]);
	expect(input).toEqual(before);
});

// Synthetic metadata only: no binary payload is provided or requested.
test("audits the draft through GET metadata, latest.json and two exact sidecars only", async () => {
	const input = fixture();
	const paths: string[] = [];
	const read = async (path: string, _limit: number, binary = false) => {
		paths.push(path);
		if (path.includes("/releases?"))
			return JSON.stringify([
				{ id: 42, tag_name: input.tag, draft: true, prerelease: false },
			]);
		if (path.includes("/releases/42/assets?")) return JSON.stringify(input.assets);
		const id = Number(path.split("/").at(-1));
		const asset = input.assets.find((asset) => asset.id === id);
		if (!binary || !asset) throw new Error("Unexpected request");
		if (asset.name === "latest.json") return JSON.stringify(input.manifest);
		const sidecar = input.sidecars[asset.name];
		if (!sidecar) throw new Error("Binary payload requested");
		return sidecar;
	};
	expect(await auditDraft(input.repository, input.tag, read)).toEqual({
		releaseId: 42,
		tag: input.tag,
		targets: ["windows-x86_64-nsis", "linux-x86_64-appimage"],
	});
	expect(paths).toEqual([
		`/repos/${input.repository}/releases?per_page=100&page=1`,
		`/repos/${input.repository}/releases/42/assets?per_page=100&page=1`,
		`/repos/${input.repository}/releases/assets/1`,
		`/repos/${input.repository}/releases/assets/3`,
		`/repos/${input.repository}/releases/assets/5`,
	]);
});
