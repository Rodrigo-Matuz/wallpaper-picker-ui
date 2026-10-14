export type NoteInline = { kind: "text" | "strong"; text: string };

/** Preview only a short prefix, not a hidden copy of the entire untrusted feed. */
export function releaseNotesPreview(body: string): string {
	let end = Math.min(body.length, 360);
	let lines = 1;
	for (let index = 0; index < end; index++) {
		if (body[index] === "\n" && lines++ === 5) {
			end = index;
			break;
		}
	}
	if (end === body.length) return body;
	// Prefer a word boundary for a character-limited single paragraph.
	if (end === 360) {
		const space = body.lastIndexOf(" ", end);
		if (space > 280) end = space;
	}
	if (end > 0 && /[\uD800-\uDBFF]/.test(body[end - 1])) end--;
	return body.slice(0, end).trimEnd();
}
export type NoteBlock = {
	tag: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
	content: NoteInline[];
};

function inline(text: string, budget: number): NoteInline[] {
	const content: NoteInline[] = [];
	let offset = 0;
	while (offset < text.length) {
		const start = text.indexOf("**", offset);
		const end = start < 0 ? -1 : text.indexOf("**", start + 2);
		if (end < 0 || content.length + 3 > Math.min(1000, budget)) {
			content.push({ kind: "text", text: text.slice(offset) });
			break;
		}
		if (start > offset) content.push({ kind: "text", text: text.slice(offset, start) });
		content.push({ kind: "strong", text: text.slice(start + 2, end) });
		offset = end + 2;
	}
	return content;
}

function headingSpace(code: number): boolean {
	// ECMAScript whitespace, excluding line terminators (handled as malformed below).
	return (
		code === 0x09 ||
		code === 0x0b ||
		code === 0x0c ||
		code === 0x20 ||
		code === 0xa0 ||
		code === 0x1680 ||
		(code >= 0x2000 && code <= 0x200a) ||
		code === 0x202f ||
		code === 0x205f ||
		code === 0x3000 ||
		code === 0xfeff
	);
}

function heading(line: string): { level: number; text: string } | undefined {
	let level = 0;
	while (level < 7 && line[level] === "#") level++;
	if (level < 1 || level > 6 || !headingSpace(line.charCodeAt(level))) return;
	let start = -1;
	// One forward pass: whitespace cannot backtrack into heading content.
	for (let index = level; index < line.length; index++) {
		const code = line.charCodeAt(index);
		if (code === 0x0d || code === 0x0a || code === 0x2028 || code === 0x2029) return;
		if (start < 0 && !headingSpace(code)) start = index;
	}
	if (start >= 0) return { level, text: line.slice(start) };
}

/** Tiny, non-recursive text grammar. No HTML, URLs or feed-controlled attributes. */
export function parseReleaseNotes(body: string): NoteBlock[] {
	const blocks: NoteBlock[] = [];
	let offset = 0;
	let budget = 2000;
	while (offset < body.length) {
		// Bound structural work; oversized tails remain intact as one escaped text node.
		if (blocks.length >= 1000 || budget <= 0) {
			blocks.push({ tag: "p", content: [{ kind: "text", text: body.slice(offset) }] });
			break;
		}
		const newline = body.indexOf("\n", offset);
		const end = newline < 0 ? body.length : newline;
		const line = body.slice(offset, end).replace(/\r$/, "");
		const title = heading(line);
		const content = inline(title ? title.text : line, budget);
		blocks.push({
			tag: title ? (`h${title.level}` as NoteBlock["tag"]) : "p",
			content,
		});
		budget -= content.length;
		offset = end + 1;
	}
	return blocks;
}
