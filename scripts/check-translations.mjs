/**
 * Verifies that all translation files define the exact same key set and that
 * every key follows the dot-notation convention.
 *
 * Exits 1 with a diff report when a key is missing/extra in any language or
 * when a key violates the naming pattern. Run via `bun run check:translations`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TRANSLATIONS_DIR = "src/lib/lang/translations";
const KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;

const files = readdirSync(TRANSLATIONS_DIR).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
	console.error(`No translation files found in ${TRANSLATIONS_DIR}`);
	process.exit(1);
}

/** @type {Map<string, Map<string, string>>} file -> key -> value */
const keySets = new Map();

for (const file of files) {
	const path = join(TRANSLATIONS_DIR, file);
	let data;
	try {
		data = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		console.error(`× ${file}: invalid JSON (${error.message})`);
		process.exit(1);
	}
	const translations = data?.translations ?? {};
	keySets.set(file, new Map(Object.entries(translations)));

	const badKeys = Object.keys(translations).filter((k) => !KEY_PATTERN.test(k));
	for (const key of badKeys) {
		console.error(`× ${file}: key "${key}" does not follow dot notation`);
	}
	if (badKeys.length > 0) process.exitCode = 1;
}

const [referenceFile] = files;
const reference = keySets.get(referenceFile);
let failed = process.exitCode === 1;

for (const file of files.slice(1)) {
	const keys = keySets.get(file);
	const referenceKeys = keySets.get(referenceFile);

	for (const key of referenceKeys.keys()) {
		if (!keys.has(key)) {
			console.error(`× ${file}: missing key "${key}" (present in ${referenceFile})`);
			failed = true;
		}
	}
	for (const key of keys.keys()) {
		if (!referenceKeys.has(key)) {
			console.error(`× ${file}: extra key "${key}" (not in ${referenceFile})`);
			failed = true;
		}
	}
}

// Values must be non-empty strings
for (const [file, translations] of keySets) {
	for (const [key, value] of translations) {
		if (typeof value !== "string" || value.trim() === "") {
			console.error(`× ${file}: "${key}" has an empty or non-string value`);
			failed = true;
		}
	}
}

if (failed) {
	console.error(`\n× Translation check failed across ${files.length} file(s).`);
	process.exit(1);
} else {
	console.log(`✓ ${files.length} translation files in sync (${reference.size} keys each).`);
}
