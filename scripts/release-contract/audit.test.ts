import { expect, test } from "bun:test";
import { auditDraft } from "./audit";
import { fixture } from "./fixtures";

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

// Synthetic metadata only: no binary payload is provided or requested.
test("audits the draft through GET metadata, latest.json and three exact sidecars only", async () => {
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
		targets: ["windows-x86_64-nsis", "windows-x86_64-msi", "linux-x86_64-appimage"],
	});
	expect(paths).toHaveLength(6);
});
