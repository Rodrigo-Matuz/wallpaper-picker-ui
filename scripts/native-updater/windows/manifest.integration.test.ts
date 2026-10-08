import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { type Manifest, validateManifest } from "./guards";

// Captured public v3.6.0/v3.6.1 release + latest.json fields, not guessed asset mocks.
// Only select_asset runs: no network, downloads, native operations or payload verification.
const selector = fileURLToPath(new URL("../artifacts/artifacts.py", import.meta.url));
const fixture = fileURLToPath(
	new URL("./fixtures/published-windows-3.6.0-3.6.1.json", import.meta.url),
);
const select = `
import importlib.util, json, pathlib, sys
spec = importlib.util.spec_from_file_location("artifacts", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
records = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
kind = sys.argv[3]
target = "windows-x86_64-" + kind
root = "D:/a/_temp/native-updater-acceptance/" + kind
manifest = {"schema": 1, "repository": module.REPOSITORY, "target": target, "caseRoot": root}
for role, version, record in zip(("baseline", "candidate"), ("3.6.0", "3.6.1"), records):
    asset = module.select_asset(record["release"], record["feed"], version, target)
    # Model the fetcher's post-download transport fields only, not proof of integrity.
    asset["artifactPath"] = root + "/" + role + "-" + asset["assetName"]
    asset["sha256AndSizeVerified"] = True
    manifest[role] = asset
print(json.dumps(manifest))
`;

for (const kind of ["nsis", "msi"] as const) {
	test(`real shared select_asset manifest reaches Windows ${kind} validator unchanged`, () => {
		const child = spawnSync(
			process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3"),
			["-B", "-c", select, selector, fixture, kind],
			{ encoding: "utf8" },
		);
		expect(child.error).toBeUndefined();
		expect(child.status).toBe(0);
		expect(child.stderr).toBe("");
		const manifest: Manifest = JSON.parse(child.stdout);
		const validated = validateManifest(manifest, kind, "D:/a/_temp");
		expect(validated).toEqual(manifest);
		const suffix = kind === "nsis" ? "x64-setup.exe" : "x64_en-US.msi";
		expect(validated.baseline.assetName).toBe(`Wallpaper.Picker.UI_3.6.0_${suffix}`);
		expect(validated.candidate.assetName).toBe(`Wallpaper.Picker.UI_3.6.1_${suffix}`);
		expect(() =>
			validateManifest(manifest, kind === "nsis" ? "msi" : "nsis", "D:/a/_temp"),
		).toThrow("Exact matching installer target");
	});
}
