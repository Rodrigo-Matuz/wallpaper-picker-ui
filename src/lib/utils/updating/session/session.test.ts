import { describe, expect, it } from "bun:test";
import { createUpdaterSession } from "./session";

describe("native launch session", () => {
	it("never calls the controller in browser or development sessions", async () => {
		let checks = 0;
		const session = createUpdaterSession(async () => {
			checks++;
		});
		for (const readiness of [
			{ native: false, development: false },
			{ native: true, development: true },
		]) {
			await session.start({ ...readiness, languageReady: Promise.resolve() });
		}
		expect(checks).toBe(0);
	});

	it("claims each version notice only once without touching the resource", () => {
		let checks = 0;
		const session = createUpdaterSession(async () => {
			checks++;
		});
		expect(session.claimNotice("3.7.0")).toBe(true);
		expect(session.claimNotice("3.7.0")).toBe(false);
		expect(session.claimNotice("3.8.0")).toBe(true);
		expect(checks).toBe(0);
	});

	it("does not retry rejected launch checks", async () => {
		let checks = 0;
		const session = createUpdaterSession(async () => {
			checks++;
			throw new Error("offline");
		});
		const readiness = { native: true, development: false, languageReady: Promise.resolve() };
		await session.start(readiness);
		await session.start(readiness);
		expect(checks).toBe(1);
	});
	it("waits for language readiness, checks once and does not wait for the check", async () => {
		let ready!: () => void;
		const languageReady = new Promise<void>((resolve) => {
			ready = resolve;
		});
		let checks = 0;
		const session = createUpdaterSession(() => {
			checks++;
			return new Promise(() => {});
		});
		const start = session.start({ native: true, development: false, languageReady });
		expect(checks).toBe(0);
		ready();
		await start;
		expect(checks).toBe(1);
		await session.start({ native: true, development: false, languageReady });
		expect(checks).toBe(1);
	});
});
