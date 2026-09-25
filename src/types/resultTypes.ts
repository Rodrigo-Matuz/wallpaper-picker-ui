/**
 * Discriminated result type for frontend API calls that can fail.
 *
 * Replaces sentinel values (e.g. returning `""` from `generateThumb`) so
 * callers can react to failures explicitly instead of checking magic values.
 *
 * @example
 * ```ts
 * const result = await generateThumb(videoPath);
 * if (!result.ok) {
 *     console.error(result.error);
 *     return;
 * }
 * const thumbPath = result.value;
 * ```
 */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: string };
