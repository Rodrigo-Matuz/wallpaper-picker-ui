/** Serializes destructive and generating thumbnail operations. */
let locked = false;
const waiters: (() => void)[] = [];

export async function withThumbnailOperation<T>(operation: () => Promise<T>): Promise<T> {
	if (locked) {
		await new Promise<void>((resolve) => waiters.push(resolve));
	}
	locked = true;

	try {
		return await operation();
	} finally {
		const next = waiters.shift();
		if (next) next();
		else locked = false;
	}
}
