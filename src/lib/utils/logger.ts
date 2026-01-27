import { invoke } from "@tauri-apps/api/core";
import { fetchConfig } from "$api/config/read";
import type { LoggerInterArgs, StructuredLogMessage } from "$types/loggerTypes";

/** DOCS:
 * Logs a message to the backend with a specified log level and contextual information.
 *
 * The logger extracts the file name and line number from the provided `Error` stack trace
 * and prepends it to the final log message. Logging is skipped entirely when `debugMode`
 * is disabled.
 *
 * The `message` field supports multiple formats:
 * - `string | number` → logged directly
 * - `Error` → logs `error.message`
 * - `{ context: string; error?: unknown }` → preferred format for failures
 * - arbitrary objects → serialized with `JSON.stringify`
 *
 * @param args - Logging parameters.
 * @param args.level - Log level ("info" | "warn" | "error" | "positive"). Defaults to "info".
 * @param args.message - Message payload (string, Error, structured object, or arbitrary data).
 * @param args.callStack - Error instance used to extract file and line information.
 *
 * @returns Resolves once the log message has been sent to the backend.
 *
 * @example
 * ```ts
 * // Simple message
 * await log({
 *   level: "info",
 *   message: "Application started",
 *   callStack: new Error(),
 * });
 *
 * // Error with context (recommended)
 * try {
 *   throw new Error("Disk is full");
 * } catch (error) {
 *   await log({
 *     level: "error",
 *     message: {
 *       context: "Failed to save thumbnails",
 *       error,
 *     },
 *     callStack: new Error(),
 *   });
 * }
 * ```
 */
export async function log({ level = "info", message, callStack }: LoggerInterArgs): Promise<void> {
	const debugMode = (await fetchConfig()).debugMode;
	if (!debugMode) return;

	/* -------- stack location extraction -------- */
	const stack = callStack.stack?.split("\n") ?? [];
	const stackLine = stack.find((line) => line.match(/(src\/|node_modules\/)/));

	let logLocation = "";

	if (stackLine) {
		// [optional dev URL]filePath:line:column
		const match = stackLine.match(/(http:\/\/localhost:\d+\/)?([^:]+):(\d+):(\d+)/);

		if (match) {
			const filePath = match[2];
			const lineNumber = match[3];
			const fileName = filePath.split("/").pop();
			logLocation = `[Line: ${lineNumber}][File: ${fileName}]`;
		}
	}

	/* -------- message normalization -------- */

	const messageStr = normalizeLogMessage(message);

	const finalMessage = logLocation
		? `${logLocation}: ${messageStr}`
		: messageStr;

	await invoke("log_message", {
		level,
		message: finalMessage,
	});
}

/** DOCS:
 * Normalizes any supported log message into a safe, human-readable string.
 *
 * This function defines the canonical rules for how log messages are rendered
 * before being sent to the backend. It is intentionally defensive and accepts
 * `unknown` input to avoid runtime failures during logging.
 *
 * Resolution order (highest priority first):
 *
 * 1. Structured log messages:
 *    `{ context: string; error?: unknown }`
 *    - If `error` is an `Error`, its `.message` is appended to `context`
 *    - If `error` exists but is not an `Error`, it is stringified
 *    - If no `error` is provided, only `context` is logged
 *
 * 2. `Error` instances:
 *    - Logs `error.message`
 *
 * 3. Arbitrary objects:
 *    - Serialized using `JSON.stringify`
 *    - Falls back to "[Unserializable object]" if serialization fails
 *
 * 4. Primitives and everything else:
 *    - Coerced using `String(value)`
 *
 * This function must never throw — logging should not cause application failures.
 *
 * @param message - Any value provided to the logger.
 * @returns A normalized string safe for backend logging.
 */
function normalizeLogMessage(message: unknown): string {
	if (isStructuredLogMessage(message)) {
		if (message.error instanceof Error) {
			return `${message.context}: ${message.error.message}`;
		}

		if (message.error !== undefined) {
			return `${message.context}: ${String(message.error)}`;
		}

		return message.context;
	}

	if (message instanceof Error) {
		return message.message;
	}

	if (typeof message === "object" && message !== null) {
		try {
			return JSON.stringify(message);
		} catch {
			return "[Unserializable object]";
		}
	}

	return String(message);
}

/** DOCS:
 * Type guard that checks whether a value is a structured log message.
 *
 * A structured log message is an object with a required `context` string
 * and an optional `error` payload:
 *
 *   { context: string; error?: unknown }
 *
 * This guard is used to safely narrow `unknown` values before extracting
 * contextual information for logging.
 *
 * @param value - Value to check.
 * @returns `true` if the value matches the structured log message shape.
 */
function isStructuredLogMessage(
	value: unknown,
): value is StructuredLogMessage {
	return (
		typeof value === "object" &&
		value !== null &&
		"context" in value &&
		typeof (value as { context: unknown }).context === "string"
	);
}
