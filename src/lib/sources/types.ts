// Source/tone tags carried by composer custom-tag badges. The Contexts
// sidebar that produced these was removed, but saved drafts and sent
// messages can still contain badges with these fields, so the badge node
// keeps rendering them.
export type ContextCardSource =
	| "linear"
	| "github_issue"
	| "github_pr"
	| "github_discussion"
	| "slack_thread";

export type ContextCardStateTone =
	| "open"
	| "closed"
	| "merged"
	| "draft"
	| "answered"
	| "unanswered"
	| "urgent"
	| "neutral";
