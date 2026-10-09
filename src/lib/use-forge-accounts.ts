// Single source of truth for the avatar / profile roster across every
// surface that lists forge accounts (onboarding, settings →
// Accounts, repo settings header). Every caller shares one React Query
// cache entry, so one fetch fills it and every surface reuses it.

import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import type { ForgeAccount } from "@/lib/api";
import { forgeAccountsQueryOptions } from "@/lib/query-client";

export function useForgeAccountsAll(): UseQueryResult<ForgeAccount[]> {
	return useQuery(forgeAccountsQueryOptions());
}
