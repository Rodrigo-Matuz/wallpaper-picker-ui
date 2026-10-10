import { readFileSync } from "node:fs";
import type { UpdateSupport } from "$types/updateTypes";

/** Test-only: consume the owned Rust serializer expectation, never execute native code. */
export function readOnlyAppImageWire(): UpdateSupport {
	// Both maintained runners start at the repository root; jsdom's URL is not a file URL.
	const source = readFileSync("src-tauri/src/get_update_support/tests.rs", "utf8");
	const test = source.match(
		/fn appimage_metadata_checks_do_not_require_replace_permissions\(\)\s*\{([\s\S]*?)(?=\n#\[test\])/,
	)?.[1];
	const expectation = test?.match(/serde_json::json!\((\{[\s\S]*?\})\)/)?.[1];
	const reason = expectation?.match(/if read_only \{ ("[^"]+") \} else \{ "[^"]+" \}/);
	if (!expectation || !reason) throw new Error("Rust AppImage serializer expectation changed");
	// Select the read-only branch of the actual serializer assertion; all fields come from Rust.
	return JSON.parse(expectation.replace(reason[0], reason[1])) as UpdateSupport;
}
