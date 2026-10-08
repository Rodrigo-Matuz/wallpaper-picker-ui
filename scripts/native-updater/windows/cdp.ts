import { requireThat } from "./guards";

interface Reply {
	result?: { value?: unknown; description?: string };
	exceptionDetails?: { text?: string };
}

export class Cdp {
	private sequence = 0;
	private terminalCause?: "remote" | "other";
	private closures = new WeakSet<Error>();
	private pending = new Map<
		number,
		{
			resolve: (value: Reply) => void;
			reject: (error: Error) => void;
			timer: ReturnType<typeof setTimeout>;
			sent: boolean;
		}
	>();
	constructor(private socket: WebSocket) {
		socket.addEventListener("message", (event) => {
			try {
				const message = JSON.parse(String(event.data));
				const pending = this.pending.get(message.id);
				if (!pending) return;
				clearTimeout(pending.timer);
				this.pending.delete(message.id);
				if (message.error) pending.reject(new Error(`CDP: ${message.error.message}`));
				else pending.resolve(message.result);
			} catch {
				this.close();
			}
		});
		socket.addEventListener("close", () => this.rejectAll(true));
		socket.addEventListener("error", () => this.rejectAll());
	}
	static async connect(url: string, timeout = 15000): Promise<Cdp> {
		assertLoopback(url, "ws:");
		const socket = new WebSocket(url);
		const client = new Cdp(socket);
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				client.close();
				reject(new Error("CDP connection timeout"));
			}, timeout);
			socket.addEventListener(
				"open",
				() => {
					clearTimeout(timer);
					resolve();
				},
				{ once: true },
			);
			socket.addEventListener(
				"error",
				() => {
					clearTimeout(timer);
					client.close();
					reject(new Error("CDP connection failed"));
				},
				{ once: true },
			);
		});
		return client;
	}
	async evaluate<T = unknown>(expression: string, timeout = 30000): Promise<T> {
		const reply = await this.send(
			"Runtime.evaluate",
			{ expression, awaitPromise: true, returnByValue: true },
			timeout,
		);
		requireThat(
			!reply.exceptionDetails,
			`Webview exception: ${reply.exceptionDetails?.text ?? reply.result?.description}`,
		);
		return reply.result?.value as T;
	}
	async send(method: string, params = {}, timeout = 30000): Promise<Reply> {
		requireThat(this.socket.readyState === WebSocket.OPEN, "CDP connection closed");
		const id = ++this.sequence;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`CDP timeout: ${method}`));
			}, timeout);
			const pending = { resolve, reject, timer, sent: false };
			this.pending.set(id, pending);
			try {
				this.socket.send(JSON.stringify({ id, method, params }));
				pending.sent = true;
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(error);
			}
		});
	}
	// Object provenance, not an error-message match; only remotely closed sent requests qualify.
	ownsClosure(error: unknown): boolean {
		return error instanceof Error && this.closures.has(error);
	}
	get closedRemotely(): boolean {
		return this.terminalCause === "remote";
	}
	private rejectAll(remoteClose = false) {
		this.terminalCause ??= remoteClose ? "remote" : "other";
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			const error = new Error("CDP connection closed");
			if (remoteClose && pending.sent) this.closures.add(error);
			pending.reject(error);
		}
		this.pending.clear();
	}
	close() {
		this.rejectAll();
		this.socket.close();
	}
}

export function assertLoopback(value: string, protocol: string): void {
	const url = new URL(value);
	requireThat(
		url.protocol === protocol &&
			url.hostname === "127.0.0.1" &&
			/^\d+$/.test(url.port) &&
			!url.username &&
			!url.password,
		"Non-loopback CDP URL refused",
	);
}
