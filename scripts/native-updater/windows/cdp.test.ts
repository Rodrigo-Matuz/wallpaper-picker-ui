import { expect, test } from "bun:test";
import { assertLoopback, Cdp } from "./cdp";

test("CDP correlates replies, propagates errors, and times out", async () => {
	class Socket extends EventTarget {
		readyState: number = WebSocket.OPEN;
		send(raw: string) {
			const input = JSON.parse(raw);
			if (input.method === "hang") return;
			const reply =
				input.method === "error"
					? { id: input.id, error: { message: "denied" } }
					: { id: input.id, result: { result: { value: input.params?.expression } } };
			queueMicrotask(() =>
				this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(reply) })),
			);
		}
		close() {
			this.dispatchEvent(new Event("close"));
		}
	}
	const client = new Cdp(new Socket() as unknown as WebSocket);
	try {
		expect(await client.evaluate<string>("value")).toBe("value");
		await expect(client.send("error")).rejects.toThrow("denied");
		await expect(client.send("hang", {}, 20)).rejects.toThrow("timeout");
	} finally {
		client.close();
	}
});

class ClosingSocket extends EventTarget {
	readyState: number = WebSocket.OPEN;
	send() {
		queueMicrotask(() => {
			this.readyState = WebSocket.CLOSED;
			this.dispatchEvent(new Event("close"));
		});
	}
	close() {
		this.dispatchEvent(new Event("close"));
	}
}

test("only a remote closure of this client's sent request is eligible for handoff", async () => {
	const client = new Cdp(new ClosingSocket() as unknown as WebSocket);
	const other = new Cdp(new ClosingSocket() as unknown as WebSocket);
	const error = await client.evaluate("install").catch((error: unknown) => error);
	expect(typeof client.ownsClosure).toBe("function");
	expect(client.ownsClosure(error)).toBe(true);
	expect(other.ownsClosure(error)).toBe(false);
	expect(client.ownsClosure(new Error("CDP connection closed"))).toBe(false);
	const unsent = await client.evaluate("later").catch((error: unknown) => error);
	expect(client.ownsClosure(unsent)).toBe(false);
	other.close();
	client.close();
});

for (const failure of [
	"local-close",
	"transport-error",
	"protocol-error",
	"webview-error",
	"malformed",
	"send-error",
	"timeout",
] as const) {
	test(`CDP never qualifies ${failure} as native handoff closure`, async () => {
		class Socket extends EventTarget {
			readyState: number = WebSocket.OPEN;
			send(raw: string) {
				if (failure === "send-error") throw new Error("send denied");
				if (failure === "timeout" || failure === "local-close") return;
				const request = JSON.parse(raw);
				queueMicrotask(() => {
					if (failure === "transport-error") {
						this.dispatchEvent(new Event("error"));
						this.dispatchEvent(new Event("close"));
						return;
					}
					const data =
						failure === "malformed"
							? "{"
							: JSON.stringify(
									failure === "protocol-error"
										? { id: request.id, error: { message: "denied" } }
										: {
												id: request.id,
												result: { exceptionDetails: { text: "denied" } },
											},
								);
					this.dispatchEvent(new MessageEvent("message", { data }));
				});
			}
			close() {
				this.dispatchEvent(new Event("close"));
			}
		}
		const client = new Cdp(new Socket() as unknown as WebSocket);
		try {
			const pending = client.evaluate("install", 10).catch((error: unknown) => error);
			if (failure === "local-close") client.close();
			const error = await pending;
			expect(error).toBeInstanceOf(Error);
			expect(client.ownsClosure(error)).toBe(false);
			expect(client.closedRemotely).toBe(false);
		} finally {
			client.close();
		}
	});
}

test("CDP accepts only explicit IPv4 loopback URLs with numeric ports", () => {
	expect(() => assertLoopback("ws://127.0.0.1:9222/devtools/page/main", "ws:")).not.toThrow();
	for (const url of [
		"ws://localhost:9222/a",
		"ws://example.org/a",
		"ws://127.0.0.1.evil:1/a",
		"ws://user@127.0.0.1:9222/a",
		"wss://127.0.0.1:9222/a",
		"ws://127.0.0.1/a",
	]) {
		expect(() => assertLoopback(url, "ws:")).toThrow();
	}
});
