// Sets the app version in every file that declares it.
// Usage: bun run version <x.y.z>
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
	console.error("Usage: bun run version <x.y.z>  (e.g. bun run version 3.4.0)");
	process.exit(1);
}

// package.json — rewrite preserving tab indentation
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = version;
writeFileSync("package.json", `${JSON.stringify(pkg, null, "\t")}\n`);

// src-tauri/tauri.conf.json — targeted replace, keeps formatting intact
const tauriConf = "src-tauri/tauri.conf.json";
const tauri = readFileSync(tauriConf, "utf8");
if (!/("version":\s*")[^"]*(")/.test(tauri)) {
	console.error("Could not find version in tauri.conf.json");
	process.exit(1);
}
writeFileSync(tauriConf, tauri.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`));

// src-tauri/Cargo.toml — targeted replace of the [package] version
const cargoToml = "src-tauri/Cargo.toml";
const cargo = readFileSync(cargoToml, "utf8");
if (!/(^version\s*=\s*")[^"]*(")/m.test(cargo)) {
	console.error("Could not find version in Cargo.toml");
	process.exit(1);
}
writeFileSync(cargoToml, cargo.replace(/(^version\s*=\s*")[^"]*(")/m, `$1${version}$2`));

console.log(`Version updated to ${version} in package.json, tauri.conf.json, Cargo.toml`);
console.log("Reminder: Cargo.lock updates on the next cargo/tauri build.");
