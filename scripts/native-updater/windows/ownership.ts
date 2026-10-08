import { lstat, realpath } from "node:fs/promises";
import { win32 as path } from "node:path";
import { ownedPath, requireThat } from "./guards";

// Check both the literal ownership boundary and every existing ancestor before writes/native calls.
export async function verifyCaseRoot(runnerTemp: string, root: string): Promise<void> {
	ownedPath(path.join(runnerTemp, "native-updater-acceptance"), root);
	ownedPath(
		path.join(await realpath(runnerTemp), "native-updater-acceptance"),
		await realpath(root),
	);
	const base = path.resolve(runnerTemp).toLowerCase();
	let current = path.normalize(root);
	while (true) {
		const entry = await lstat(current);
		requireThat(
			entry.isDirectory() && !entry.isSymbolicLink(),
			"Symlink/non-directory case-root ancestor refused",
		);
		if (current.toLowerCase() === base) break;
		current = path.dirname(current);
	}
}
