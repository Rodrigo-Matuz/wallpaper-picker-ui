/**
 * Normalizes a string for fuzzy filename search: strips underscores and
 * whitespace, lowercases. Shared by the home search input and the thumbnail
 * grid filter so both sides of the comparison match.
 */
export function normalizeForSearch(value: string): string {
	return value.replace(/[_\s]+/g, "").toLowerCase();
}
