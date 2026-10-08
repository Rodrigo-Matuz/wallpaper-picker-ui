import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs/promises";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as driver from "./run";

const invocation = "0123456789abcdef0123456789abcdef";

test("cleanup evidence readback is bounded and survives native stop failure without masking it", async () => {
	expect(typeof driver.readStopComparisons).toBe("function");
	const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
	if (!scratch) throw new Error("Task-owned scratch required");
	const root = await mkdtemp(join(scratch, "native-stop-read-"));
	try {
		expect(await driver.readStopComparisons(root)).toEqual({
			state: "unknown",
			reason: "missing-or-invalid-owned-stop-evidence",
		});
		await writeFile(
			join(root, "stop-comparison.json"),
			JSON.stringify({ invocation, count: 1, first: sample, latest: sample }),
		);
		expect(await driver.readStopComparisons(root, invocation)).toEqual({
			state: "observed",
			...driver.parseStopComparisons({ count: 1, first: sample, latest: sample }),
		});
		await writeFile(join(root, "stop-comparison.json"), "x".repeat(300001));
		expect(await driver.readStopComparisons(root, invocation)).toEqual({
			state: "unknown",
			reason: "missing-or-invalid-owned-stop-evidence",
		});
		const source = await readFile(new URL("./run.ts", import.meta.url), "utf8");
		const stop = source.slice(
			source.indexOf("stop: async (payload) =>"),
			source.indexOf("processes: async () =>", source.indexOf("stop: async (payload) =>")),
		);
		expect(stop).toContain("stopWithComparisons(");
		expect(stop).toContain("stopInvocation");
		expect(source.indexOf("consumeOutput(stdout)")).toBeLessThan(
			source.indexOf("requireThat(code === 0"),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("growth after lstat never allocates or reads beyond the strict evidence byte cap", async () => {
	const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
	if (!scratch) throw new Error("Task-owned scratch required");
	const root = await mkdtemp(join(scratch, "native-stop-growth-"));
	const file = join(root, "stop-comparison.json");
	const originalLstat = fs.lstat;
	const originalReadFile = fs.readFile;
	let allocated = 0;
	let grew = false;
	await writeFile(file, "{}");
	const statSpy = spyOn(fs, "lstat").mockImplementation((async (
		...args: Parameters<typeof fs.lstat>
	) => {
		const info = await originalLstat(...args);
		if (args[0] === file && !grew) {
			grew = true;
			await writeFile(file, "x".repeat(400001));
		}
		return info;
	}) as typeof fs.lstat);
	const readSpy = spyOn(fs, "readFile").mockImplementation((async (
		...args: Parameters<typeof fs.readFile>
	) => {
		const body = await originalReadFile(...args);
		if (args[0] === file) allocated += Buffer.byteLength(body);
		return body;
	}) as typeof fs.readFile);
	try {
		expect(await driver.readStopComparisons(root, invocation)).toEqual({
			state: "unknown",
			reason: "missing-or-invalid-owned-stop-evidence",
		});
		expect(grew).toBe(true);
		expect(allocated).toBeLessThanOrEqual(300000);
	} finally {
		statSpy.mockRestore();
		readSpy.mockRestore();
		await rm(root, { recursive: true, force: true });
	}
});

test("schema-valid replacement after lstat is rejected by opened handle identity", async () => {
	const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
	if (!scratch) throw new Error("Task-owned scratch required");
	const root = await mkdtemp(join(scratch, "native-stop-replace-"));
	const file = join(root, "stop-comparison.json");
	const body = JSON.stringify({ invocation, count: 1, first: sample, latest: sample });
	await writeFile(file, body);
	await writeFile(join(root, "replacement.json"), body);
	const originalLstat = fs.lstat;
	let replaced = false;
	const statSpy = spyOn(fs, "lstat").mockImplementation((async (
		...args: Parameters<typeof fs.lstat>
	) => {
		const info = await originalLstat(...args);
		if (args[0] === file && !replaced) {
			replaced = true;
			await rename(file, join(root, "original.json"));
			await rename(join(root, "replacement.json"), file);
		}
		return info;
	}) as typeof fs.lstat);
	try {
		expect(await driver.readStopComparisons(root, invocation)).toEqual({
			state: "unknown",
			reason: "missing-or-invalid-owned-stop-evidence",
		});
		expect(replaced).toBe(true);
	} finally {
		statSpy.mockRestore();
		await rm(root, { recursive: true, force: true });
	}
});

test("growth through an actual opened handle reads only a fixed capped buffer and closes", async () => {
	const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
	if (!scratch) throw new Error("Task-owned scratch required");
	const root = await mkdtemp(join(scratch, "native-stop-handle-growth-"));
	const file = join(root, "stop-comparison.json");
	await writeFile(file, JSON.stringify({ invocation, count: 1, first: sample, latest: sample }));
	const originalOpen = fs.open;
	let reads = 0;
	let bytes = 0;
	let largestBuffer = 0;
	let closed = false;
	const openSpy = spyOn(fs, "open").mockImplementation(
		async (...args: Parameters<typeof fs.open>) => {
			const handle = await originalOpen(...args);
			const originalRead = handle.read.bind(handle);
			const originalClose = handle.close.bind(handle);
			handle.read = (async (
				buffer: Buffer,
				offset: number,
				length: number,
				position: number,
			) => {
				if (!reads++) await writeFile(file, "x".repeat(400001));
				largestBuffer = Math.max(largestBuffer, buffer.byteLength);
				const result = await originalRead(buffer, offset, length, position);
				bytes += result.bytesRead;
				return result;
			}) as typeof handle.read;
			handle.close = async () => {
				closed = true;
				await originalClose();
			};
			return handle;
		},
	);
	try {
		expect(await driver.readStopComparisons(root, invocation)).toEqual({
			state: "unknown",
			reason: "missing-or-invalid-owned-stop-evidence",
		});
		expect(reads).toBeGreaterThan(0);
		expect(bytes).toBeLessThanOrEqual(300000);
		expect(largestBuffer).toBeLessThanOrEqual(300000);
		expect(closed).toBe(true);
	} finally {
		openSpy.mockRestore();
		await rm(root, { recursive: true, force: true });
	}
});

test("byte cap accepts the exact boundary but rejects schema-valid multibyte overflow", async () => {
	const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
	if (!scratch) throw new Error("Task-owned scratch required");
	const root = await mkdtemp(join(scratch, "native-stop-byte-boundary-"));
	try {
		const file = join(root, "stop-comparison.json");
		const base = JSON.stringify({
			invocation,
			count: 1,
			first: sample,
			latest: sample,
			padding: "",
		});
		const boundary = JSON.stringify({
			invocation,
			count: 1,
			first: sample,
			latest: sample,
			padding: " ".repeat(300000 - Buffer.byteLength(base)),
		});
		expect(Buffer.byteLength(boundary)).toBe(300000);
		await writeFile(file, boundary);
		expect((await driver.readStopComparisons(root, invocation)).state).toBe("observed");
		const wide = { ...sample, capturedPath: "€".repeat(32768), handlePath: "€".repeat(32768) };
		const multibyte = JSON.stringify({ invocation, count: 1, first: wide, latest: wide });
		expect(multibyte.length).toBeLessThan(300000);
		expect(Buffer.byteLength(multibyte)).toBeGreaterThan(300000);
		await writeFile(file, multibyte);
		expect((await driver.readStopComparisons(root, invocation)).state).toBe("unknown");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

for (const mode of ["short-read", "close-failure", "read-failure", "replace-after-open"]) {
	test(`actual evidence handle preserves diagnostics semantics: ${mode}`, async () => {
		const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
		if (!scratch) throw new Error("Task-owned scratch required");
		const root = await mkdtemp(join(scratch, "native-stop-handle-error-"));
		const file = join(root, "stop-comparison.json");
		const body = JSON.stringify({ invocation, count: 1, first: sample, latest: sample });
		await writeFile(file, body);
		await writeFile(join(root, "replacement.json"), body);
		const originalOpen = fs.open;
		let closed = false;
		let changed = false;
		let reads = 0;
		const openSpy = spyOn(fs, "open").mockImplementation(
			async (...args: Parameters<typeof fs.open>) => {
				const handle = await originalOpen(...args);
				const originalRead = handle.read.bind(handle);
				const originalClose = handle.close.bind(handle);
				handle.read = (async (
					buffer: Buffer,
					offset: number,
					length: number,
					position: number,
				) => {
					reads++;
					if (mode === "read-failure")
						throw new Error("Synthetic owned handle read failure");
					const result = await originalRead(
						buffer,
						offset,
						mode === "short-read" ? Math.min(length, 7) : length,
						position,
					);
					if (mode === "replace-after-open" && !changed) {
						await rename(file, join(root, "original.json"));
						await rename(join(root, "replacement.json"), file);
						changed = true;
					}
					return result;
				}) as typeof handle.read;
				handle.close = async () => {
					closed = true;
					await originalClose();
					if (mode === "close-failure")
						throw new Error("Synthetic owned handle close failure");
				};
				return handle;
			},
		);
		try {
			const result = await driver.readStopComparisons(root, invocation);
			expect(result.state).toBe(mode === "short-read" ? "observed" : "unknown");
			expect(closed).toBe(true);
			expect(reads).toBeGreaterThan(0);
			if (mode === "short-read" && result.state === "observed")
				expect(result.first).toEqual(sample);
			if (mode === "replace-after-open") expect(changed).toBe(true);
		} finally {
			openSpy.mockRestore();
			await rm(root, { recursive: true, force: true });
		}
	});
}

test("schema-valid pre-existing comparison is unknown without a current writer claim", async () => {
	const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
	if (!scratch) throw new Error("Task-owned scratch required");
	const root = await mkdtemp(join(scratch, "native-stop-stale-"));
	try {
		const stale = JSON.stringify({ count: 1, first: sample, latest: sample });
		const file = join(root, "stop-comparison.json");
		await writeFile(file, stale, { flag: "wx" });
		expect(await driver.readStopComparisons(root)).toEqual({
			state: "unknown",
			reason: "missing-or-invalid-owned-stop-evidence",
		});
		expect(await readFile(file, "utf8")).toBe(stale);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("current writer receipt survives stop refusal and never attributes stale evidence", async () => {
	const diagnostics = await import("./cleanup-diagnostics");
	const scratch = process.env.TMPDIR ?? process.env.RUNNER_TEMP;
	if (!scratch) throw new Error("Task-owned scratch required");
	const root = await mkdtemp(join(scratch, "native-stop-receipt-"));
	const refusal = new Error("Owned process identity changed before termination");
	try {
		let evidence: unknown;
		for (const claim of ["current", "absent", "foreign-receipt", "foreign-file"] as const) {
			await expect(
				diagnostics.stopWithComparisons(
					root,
					async (invocation, consume) => {
						await writeFile(
							join(root, "stop-comparison.json"),
							JSON.stringify({
								invocation: claim === "foreign-file" ? "f".repeat(32) : invocation,
								count: 1,
								first: sample,
								latest: sample,
							}),
						);
						consume(
							claim === "absent"
								? ""
								: `WP_STOP_CLAIM:${claim === "foreign-receipt" ? "f".repeat(32) : invocation}\n`,
						);
						throw refusal;
					},
					(value) => {
						evidence = value;
					},
				),
			).rejects.toBe(refusal);
			expect(evidence).toEqual(
				claim === "current"
					? {
							state: "observed",
							...driver.parseStopComparisons({
								count: 1,
								first: sample,
								latest: sample,
							}),
						}
					: { state: "unknown", reason: "missing-or-invalid-owned-stop-evidence" },
			);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

const sample = {
	requestedPid: 123,
	handlePid: 123,
	capturedPath: "C:\\owned\\wallpaper-picker-ui.exe",
	handlePath: "C:\\owned\\wallpaper-picker-ui.exe",
	handlePathState: "observed",
	capturedStartedUtc: "2026-10-07T20:06:45.1619670Z",
	notBeforeUtc: "2026-10-07T20:06:00.000Z",
	handleStartText: "2026-10-07T20:06:45.1619671Z",
	handleStartKind: "Utc",
	capturedParsedText: "2026-10-07T20:06:45.1619670Z",
	capturedParsedKind: "Utc",
	handleUtcText: "2026-10-07T20:06:45.1619671Z",
	capturedUtcText: "2026-10-07T20:06:45.1619670Z",
	handleUtcTicks: "639270004051619671",
	capturedUtcTicks: "639270004051619670",
};

test("cleanup comparison decoder retains exact first/latest operands, not arbitrary fields", () => {
	expect(typeof driver.parseStopComparisons).toBe("function");
	const result = driver.parseStopComparisons({
		count: 2,
		first: sample,
		latest: { ...sample, handlePath: "C:\\different\\wallpaper-picker-ui.exe" },
		env: "SECRET",
		token: "SECRET",
	});
	expect(result.first).toEqual(sample);
	expect(result.latest.handlePath).toBe("C:\\different\\wallpaper-picker-ui.exe");
	expect(result.first.handleUtcTicks).toBe("639270004051619671");
	expect(result.first.capturedUtcTicks).toBe("639270004051619670");
	expect(JSON.stringify(result)).not.toContain("SECRET");
	for (const invalid of [
		null,
		{ count: 0, first: sample, latest: sample },
		{ count: 1000001, first: sample, latest: sample },
		{
			count: 1,
			first: { ...sample, handleUtcTicks: Number(sample.handleUtcTicks) },
			latest: sample,
		},
		{ count: 1, first: { ...sample, capturedPath: "x".repeat(32769) }, latest: sample },
		{ count: 1, first: { ...sample, handlePathState: undefined }, latest: sample },
	])
		expect(() => driver.parseStopComparisons(invalid)).toThrow();
});
