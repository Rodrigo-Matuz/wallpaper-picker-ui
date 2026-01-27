/** DOCS:
 * Sorts an object by its keys in alphabetical order.
 *
 * @template T - The type of the values in the JSON object.
 * @param json - The JSON object to be sorted by key.
 * @returns A new object with keys sorted alphabetically.
 *
 * @example
 * ```ts
 * const unsorted = { zebra: 5, apple: 3, orange: 2 };
 * sortJsonByKey(unsorted);
 * // { apple: 3, orange: 2, zebra: 5 }
 * ```
 */
export function sortJsonByKey<T>(
    json: Readonly<Record<string, T>>
): Record<string, T> {
    return Object.fromEntries(
        Object.entries(json).sort(([a], [b]) => a.localeCompare(b))
    );
}

