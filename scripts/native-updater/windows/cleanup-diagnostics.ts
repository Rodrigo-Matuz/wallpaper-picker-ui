import { randomUUID } from "node:crypto";
import type { BigIntStats } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { requireThat } from "./guards";

interface StopSample {
	requestedPid: number;
	handlePid: number;
	capturedPath: string | null;
	handlePath: string | null;
	handlePathState: string;
	capturedPathState?: string;
	capturedPathLength?: number;
	handlePathLength?: number;
	capturedStartedUtc: string;
	notBeforeUtc: string;
	handleStartText: string;
	handleStartKind: string;
	capturedParsedText: string;
	capturedParsedKind: string;
	handleUtcText: string;
	capturedUtcText: string;
	handleUtcTicks: string;
	capturedUtcTicks: string;
}
const timePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})?$/;
function decodeSample(value: unknown): StopSample {
	requireThat(value && typeof value === "object", "Stop sample required");
	const source = value as Record<string, unknown>;
	requireThat(source.handlePathState !== undefined, "Stop handle path state required");
	const sample: Record<string, unknown> = {};
	for (const key of ["requestedPid", "handlePid"] as const) {
		requireThat(
			Number.isSafeInteger(source[key]) && (source[key] as number) > 0,
			"Stop PID required",
		);
		sample[key] = source[key];
	}
	for (const key of ["capturedPath", "handlePath"] as const) {
		const path = source[key];
		requireThat(
			path === null || (typeof path === "string" && path.length <= 32768),
			"Bounded exact stop path required",
		);
		sample[key] = path;
		const state = source[`${key}State`];
		if (state !== undefined) {
			requireThat(
				["observed", "unknown", "unknown-over-limit"].includes(state as string),
				"Stop path state invalid",
			);
			sample[`${key}State`] = state;
		}
		const length = source[`${key}Length`];
		if (length !== undefined) {
			requireThat(
				Number.isSafeInteger(length) && (length as number) > 32768,
				"Stop path length invalid",
			);
			sample[`${key}Length`] = length;
		}
	}
	for (const key of [
		"capturedStartedUtc",
		"notBeforeUtc",
		"handleStartText",
		"capturedParsedText",
		"handleUtcText",
		"capturedUtcText",
	] as const) {
		requireThat(
			typeof source[key] === "string" &&
				(source[key] as string).length <= 40 &&
				timePattern.test(source[key] as string),
			"Exact stop time required",
		);
		sample[key] = source[key];
	}
	for (const key of ["handleStartKind", "capturedParsedKind"] as const) {
		requireThat(
			["Utc", "Local", "Unspecified"].includes(source[key] as string),
			"Stop DateTime kind required",
		);
		sample[key] = source[key];
	}
	for (const key of ["handleUtcTicks", "capturedUtcTicks"] as const) {
		requireThat(
			typeof source[key] === "string" && /^\d{1,19}$/.test(source[key] as string),
			"Lossless decimal stop ticks required",
		);
		sample[key] = source[key];
	}
	return sample as unknown as StopSample;
}

/** Copy only bounded known operands. Decimal strings deliberately avoid JS integer precision loss. */
export function parseStopComparisons(value: unknown) {
	requireThat(value && typeof value === "object", "Stop comparison evidence required");
	const history = value as Record<string, unknown>;
	requireThat(
		Number.isSafeInteger(history.count) &&
			(history.count as number) >= 1 &&
			(history.count as number) <= 1000000,
		"Bounded stop comparison count required",
	);
	return {
		count: history.count as number,
		first: decodeSample(history.first),
		latest: decodeSample(history.latest),
	};
}

const evidenceByteCap = 300000;

function sameEvidenceFile(a: BigIntStats, b: BigIntStats) {
	return (
		a.isFile() &&
		b.isFile() &&
		!a.isSymbolicLink() &&
		!b.isSymbolicLink() &&
		a.ino > 0n &&
		a.dev === b.dev &&
		a.ino === b.ino &&
		a.size === b.size &&
		a.mtimeNs === b.mtimeNs &&
		a.ctimeNs === b.ctimeNs
	);
}

/** Called only for the already-verified native case root, including when native stop rejects. */
export async function readStopComparisons(root: string, claimedInvocation?: string) {
	try {
		requireThat(
			claimedInvocation && /^[a-f0-9]{32}$/.test(claimedInvocation),
			"Current writer claim required",
		);
		const file = join(root, "stop-comparison.json");
		const info = await lstat(file, { bigint: true });
		requireThat(
			info.isFile() && !info.isSymbolicLink() && info.size <= BigInt(evidenceByteCap),
			"Invalid stop evidence file",
		);
		const handle = await open(file, "r");
		let result: { state: "observed" } & ReturnType<typeof parseStopComparisons>;
		try {
			const opened = await handle.stat({ bigint: true });
			requireThat(sameEvidenceFile(info, opened), "Stop evidence replaced before open");
			// Never allocate from a mutable file size or use readFile, even as a fallback.
			const buffer = Buffer.alloc(evidenceByteCap);
			let used = 0;
			while (used < buffer.byteLength) {
				const { bytesRead } = await handle.read(
					buffer,
					used,
					buffer.byteLength - used,
					used,
				);
				if (!bytesRead) break;
				used += bytesRead;
			}
			const after = await handle.stat({ bigint: true });
			const leaf = await lstat(file, { bigint: true });
			requireThat(
				sameEvidenceFile(opened, after) &&
					sameEvidenceFile(after, leaf) &&
					BigInt(used) === after.size,
				"Stop evidence changed during bounded read",
			);
			const evidence = JSON.parse(buffer.subarray(0, used).toString("utf8"));
			requireThat(
				evidence.invocation === claimedInvocation,
				"Current invocation evidence required",
			);
			result = { state: "observed" as const, ...parseStopComparisons(evidence) };
		} finally {
			// Close failures also become unknown; the original stop result/refusal remains untouched.
			await handle.close();
		}
		return result;
	} catch {
		// Diagnostics neither mask the original stop failure nor turn missing evidence into a pass.
		return { state: "unknown" as const, reason: "missing-or-invalid-owned-stop-evidence" };
	}
}

/** Receipt arrives on this child's stdout only after CreateNew + write + flush succeeded.
 * Consume before checking its exit code: an exact stop refusal must still retain diagnostics.
 * A fresh nonce without this writer receipt is deliberately NOT evidence of ownership.
 */
export async function stopWithComparisons<T>(
	root: string,
	stop: (invocation: string, consume: (stdout: string) => string) => Promise<T>,
	publish: (evidence: Awaited<ReturnType<typeof readStopComparisons>>) => void,
) {
	const invocation = randomUUID().replaceAll("-", "");
	let claimedInvocation: string | undefined;
	try {
		return await stop(invocation, (stdout) => {
			const clean = stdout.replace(/^\uFEFF/, "");
			const prefix = `WP_STOP_CLAIM:${invocation}`;
			if (clean.startsWith(`${prefix}\r\n`) || clean.startsWith(`${prefix}\n`)) {
				claimedInvocation = invocation;
				return clean.slice(clean.indexOf("\n") + 1);
			}
			return stdout;
		});
	} finally {
		publish(await readStopComparisons(root, claimedInvocation));
	}
}
