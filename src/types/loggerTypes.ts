export type LogLevel = "info" | "warn" | "error" | "positive";

export type LogMessage = string | number | object;

export interface LoggerInterArgs {
  level?: LogLevel;
  message: LogMessage;
  callStack: Error;
}

export type StructuredLogMessage = {
	context: string;
	error?: unknown;
};
