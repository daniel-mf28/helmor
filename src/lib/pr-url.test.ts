import { describe, expect, it } from "vitest";
import { parsePrUrl } from "./pr-url";

describe("parsePrUrl", () => {
	it("parses GitHub PR URLs", () => {
		expect(parsePrUrl("https://github.com/acme/widgets/pull/42")).toEqual({
			number: 42,
			provider: "github",
		});
	});

	it("parses GitHub Enterprise PR URLs", () => {
		expect(
			parsePrUrl("https://git.corp.example.com/acme/widgets/pull/7"),
		).toEqual({
			number: 7,
			provider: "github",
		});
	});

	it("tolerates trailing query / fragment / files segments", () => {
		expect(parsePrUrl("https://github.com/a/b/pull/12/files")).toEqual({
			number: 12,
			provider: "github",
		});
		expect(parsePrUrl("https://github.com/a/b/pull/12?foo=bar")).toEqual({
			number: 12,
			provider: "github",
		});
		expect(parsePrUrl("https://github.com/a/b/pull/3#issuecomment-1")).toEqual({
			number: 3,
			provider: "github",
		});
	});

	it("returns null for non-PR URLs", () => {
		expect(parsePrUrl("https://github.com/acme/widgets")).toBeNull();
		expect(parsePrUrl("https://example.com/")).toBeNull();
		// GitLab MR URLs are no longer recognized.
		expect(
			parsePrUrl("https://gitlab.com/acme/widgets/-/merge_requests/123"),
		).toBeNull();
		expect(parsePrUrl("")).toBeNull();
		expect(parsePrUrl(null)).toBeNull();
		expect(parsePrUrl(undefined)).toBeNull();
	});

	it("returns null for malformed PR numbers", () => {
		expect(parsePrUrl("https://github.com/a/b/pull/abc")).toBeNull();
		expect(parsePrUrl("https://github.com/a/b/pull/0")).toBeNull();
	});
});
