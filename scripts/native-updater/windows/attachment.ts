import type { Cdp } from "./cdp";
import { assertLoopback } from "./cdp";

export type AttachmentStage =
	| "listener"
	| "liveness"
	| "browser"
	| "fetch"
	| "http"
	| "json"
	| "target"
	| "websocket"
	| "evaluation"
	| "support";

interface TargetSample {
	index: number;
	typeMatches: boolean;
	originMatches: boolean;
	socketPresent: boolean;
}
export interface AttachmentSample {
	outcome: "passed" | "failed" | "unknown";
	reason?: string;
	httpStatus?: number;
	targetCount?: number;
	targets?: TargetSample[];
	valueType?: string;
	truthy?: boolean;
	errorKind?: string;
}
interface Observation extends AttachmentSample {
	elapsedMs: number;
}
interface StageHistory {
	count: number;
	first: Observation;
	latest: Observation;
}

/** Fixed stage/field vocabulary: no raw response, target URLs, profile, environment or IPC dump. */
export class AttachmentDiagnostics {
	private readonly started: number;
	private histories: Partial<Record<AttachmentStage, StageHistory>> = {};
	constructor(private readonly now: () => number = Date.now) {
		this.started = now();
	}
	record(stage: AttachmentStage, sample: AttachmentSample): void {
		const observation: Observation = {
			outcome: sample.outcome,
			elapsedMs: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, this.now() - this.started)),
		};
		for (const key of ["reason", "valueType", "errorKind"] as const)
			if (sample[key] !== undefined) observation[key] = sample[key].slice(0, 160);
		if (sample.httpStatus !== undefined) observation.httpStatus = sample.httpStatus;
		if (sample.targetCount !== undefined)
			observation.targetCount = Math.min(1000000, sample.targetCount);
		if (sample.truthy !== undefined) observation.truthy = sample.truthy;
		if (sample.targets !== undefined)
			observation.targets = sample.targets.slice(0, 8).map((target) => ({
				index: target.index,
				typeMatches: target.typeMatches,
				originMatches: target.originMatches,
				socketPresent: target.socketPresent,
			}));
		const previous = this.histories[stage];
		this.histories[stage] = {
			count: Math.min(1000000, (previous?.count ?? 0) + 1),
			first: previous?.first ?? observation,
			latest: observation,
		};
	}
	snapshot(): Partial<Record<AttachmentStage, StageHistory>> {
		return structuredClone(this.histories);
	}
}

/** Preserve a useful failure category without retaining arbitrary exception text or URLs. */
export function attachmentErrorKind(error: unknown): string {
	if (!(error instanceof Error)) return "thrown-value";
	if (error.name === "AbortError" || error.name === "TimeoutError") return "request-timeout";
	if (error instanceof SyntaxError) return "json-syntax";
	if (error.message.startsWith("Webview exception:")) return "webview-exception";
	if (error.message.startsWith("CDP timeout:")) return "cdp-timeout";
	if (error.message.startsWith("CDP:")) return "cdp-protocol";
	if (error.message === "CDP connection closed") return "cdp-closed";
	return "other-error";
}

interface Page {
	type: string;
	url: string;
	webSocketDebuggerUrl: string;
}
type AttachmentClient = Pick<Cdp, "evaluate" | "close">;
export interface AttachmentOptions<C extends AttachmentClient> {
	diagnostics: AttachmentDiagnostics;
	fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;
	connect: (url: string) => Promise<C>;
	now?: () => number;
	pause?: () => Promise<void>;
}
const originPattern = /^(tauri:\/\/localhost|https?:\/\/tauri\.localhost)(\/|$)/;

/** Original selectors/deadline/catch boundaries, with fakeable transport and bounded observations. */
export async function mainWebview<C extends AttachmentClient>(
	port: number,
	clients: C[],
	options: AttachmentOptions<C>,
): Promise<C> {
	const { diagnostics } = options;
	const now = options.now ?? Date.now;
	const deadline = now() + 60000;
	const url = `http://127.0.0.1:${port}/json/list`;
	assertLoopback(url, "http:");
	// A TCP connect or machine-wide process/listener list cannot establish descendant ownership.
	// Do not query either here; absence of a safely attributed observation is explicitly unknown.
	for (const stage of ["listener", "liveness", "browser"] as const)
		diagnostics.record(stage, {
			outcome: "unknown",
			reason: "task-owned identity/session observation unavailable; no host-wide query",
		});
	const probe = async (): Promise<C | undefined> => {
		let pages: Page[];
		let response: Pick<Response, "ok" | "status" | "json">;
		try {
			response = await options.fetch(url, {
				redirect: "error",
				signal: AbortSignal.timeout(2000),
			});
			diagnostics.record("fetch", { outcome: "passed" });
		} catch (error) {
			diagnostics.record("fetch", {
				outcome: "failed",
				errorKind: attachmentErrorKind(error),
			});
			return;
		}
		diagnostics.record("http", {
			outcome: response.ok ? "passed" : "failed",
			httpStatus: response.status,
		});
		if (!response.ok) return;
		try {
			pages = (await response.json()) as Page[];
			diagnostics.record("json", {
				outcome: "passed",
				reason: Array.isArray(pages) ? "array" : "non-array",
			});
		} catch (error) {
			diagnostics.record("json", {
				outcome: "failed",
				errorKind: attachmentErrorKind(error),
			});
			return;
		}
		// Samples describe predicate results only. Never retain titles/IDs/raw URLs or foreign processes.
		const targets = Array.isArray(pages)
			? pages.slice(0, 8).map((page, index) => ({
					index,
					typeMatches: page?.type === "page",
					originMatches: typeof page?.url === "string" && originPattern.test(page.url),
					socketPresent: typeof page?.webSocketDebuggerUrl === "string",
				}))
			: [];
		let matched = false;
		if (!Array.isArray(pages))
			diagnostics.record("target", { outcome: "failed", reason: "non-array list" });
		// Keep malformed-list errors propagating, rather than adding a new catch or accepting them.
		for (const page of pages) {
			if (page.type !== "page" || !originPattern.test(page.url)) continue;
			matched = true;
			diagnostics.record("target", { outcome: "passed", targetCount: pages.length, targets });
			let client: C;
			try {
				assertLoopback(page.webSocketDebuggerUrl, "ws:");
				client = await options.connect(page.webSocketDebuggerUrl);
				diagnostics.record("websocket", { outcome: "passed" });
			} catch (error) {
				diagnostics.record("websocket", {
					outcome: "failed",
					errorKind: attachmentErrorKind(error),
				});
				throw error;
			}
			try {
				const main = await client.evaluate<boolean>(
					"Boolean(window.__TAURI_INTERNALS__?.invoke && window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label === 'main')",
				);
				diagnostics.record("evaluation", {
					outcome: main ? "passed" : "failed",
					valueType: typeof main,
					truthy: Boolean(main),
				});
				if (main) {
					clients.push(client);
					return client;
				}
			} catch (error) {
				diagnostics.record("evaluation", {
					outcome: "failed",
					errorKind: attachmentErrorKind(error),
				});
				// Loading page/exception is not evidence of a working IPC boundary; preserve retry.
			}
			client.close();
		}
		if (!matched)
			diagnostics.record("target", {
				outcome: "failed",
				reason: "no qualifying page",
				targetCount: pages.length,
				targets,
			});
	};
	while (now() < deadline) {
		const client = await probe();
		if (client !== undefined) return client;
		await (options.pause ?? (() => new Promise((resolve) => setTimeout(resolve, 500))))();
	}
	throw new Error("Timeout: packaged main WebView2 CDP");
}
