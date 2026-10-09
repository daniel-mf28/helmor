/** Lower-cased host of a git remote URL (scp-like or URL form), or
 * null when it can't be parsed. */
export function parseRemoteHost(remoteUrl?: string | null): string | null {
	const value = remoteUrl?.trim();
	if (!value) return null;
	const scpLike = value.match(/^[^@]+@([^:]+):/);
	if (scpLike?.[1]) return scpLike[1].toLowerCase();
	try {
		return new URL(value).hostname.toLowerCase() || null;
	} catch {
		return null;
	}
}
