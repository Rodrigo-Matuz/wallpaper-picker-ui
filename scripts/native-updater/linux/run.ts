import { fileURLToPath } from "node:url";
import { assertHostedLinux } from "./guards";

/** Guarded feasibility entry. A blocked/unexercised native path NEVER exits zero. */
export async function run(
	args: string[],
	env: Record<string, string | undefined> = process.env,
	platform = process.platform,
	uid: number | undefined = process.getuid?.(),
): Promise<number> {
	// Must precede file reads, process spawning, fixture setup and native launch.
	assertHostedLinux(env, platform, uid);
	if (
		args.length !== 4 ||
		args[0] !== "--case" ||
		!["writable", "readonly"].includes(args[1]) ||
		args[2] !== "--manifest" ||
		!args[3]
	) {
		throw new Error("Usage: bun run.ts --case writable|readonly --manifest PATH");
	}
	const child = Bun.spawn(
		["python3", "-B", fileURLToPath(new URL("./feasibility.py", import.meta.url)), ...args],
		{ env, stdin: "ignore", stdout: "inherit", stderr: "inherit" },
	);
	return child.exited;
}

if (import.meta.main) {
	try {
		process.exitCode = await run(process.argv.slice(2));
	} catch (error) {
		console.error(String(error));
		process.exitCode = 1;
	}
}
