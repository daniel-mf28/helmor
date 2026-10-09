import type { ProviderFamily } from "@/lib/provider-config";
import type { ProviderConfigAdapter } from "../provider-config";
import { CLAUDE_ADAPTER } from "./claude-adapter";
import { CODEX_ADAPTER } from "./codex-adapter";

const ADAPTERS: Record<ProviderFamily, ProviderConfigAdapter> = {
	claude: CLAUDE_ADAPTER,
	codex: CODEX_ADAPTER,
};

export function getProviderAdapter(
	family: ProviderFamily,
): ProviderConfigAdapter {
	return ADAPTERS[family];
}

export { CLAUDE_ADAPTER, CODEX_ADAPTER };
