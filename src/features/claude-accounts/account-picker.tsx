import { ChevronDown, Lock, UserRound } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { I18nText, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type ClaudeAccount, findClaudeAccount } from "./accounts";

// Mirrors the composer's model-picker trigger so the two read as one row.
const TRIGGER_CLASS =
	"flex items-center gap-1.5 cursor-interactive rounded-[9px] px-1 py-0.5 text-ui font-medium text-foreground/80 transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50";

type Props = {
	accounts: readonly ClaudeAccount[];
	/** Config dir of the account in use (`null` = default account). */
	selectedConfigDir: string | null;
	/** True once the chat has messages: the account can no longer change. */
	locked: boolean;
	disabled?: boolean;
	onSelect: (configDir: string | null) => void;
};

/** Composer account switcher. Editable before the first message; afterwards a
 *  read-only label (a session can only be resumed on the account it began on). */
export function ClaudeAccountPicker({
	accounts,
	selectedConfigDir,
	locked,
	disabled = false,
	onSelect,
}: Props) {
	const { t } = useI18n();
	const selected = findClaudeAccount(accounts, selectedConfigDir);

	if (locked) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					{/* A disabled <button> swallows pointer events (no tooltip), so use
					    aria-disabled on a focusable element instead. */}
					<button
						type="button"
						aria-disabled="true"
						aria-label={t("claudeAccount")}
						data-testid="claude-account-locked"
						className="flex cursor-not-allowed items-center gap-1.5 rounded-[9px] px-1 py-0.5 text-ui font-medium text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
					>
						<Lock className="size-[12px]" strokeWidth={1.8} />
						<span className="max-w-[140px] truncate">{selected.label}</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={4}>
					<I18nText source="claudeAccountFixedTooltip" />
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled}
				aria-label={t("claudeAccount")}
				className={cn(
					TRIGGER_CLASS,
					disabled &&
						"cursor-not-allowed opacity-45 hover:bg-transparent hover:text-muted-foreground",
				)}
			>
				<UserRound className="size-[13px]" strokeWidth={1.8} />
				<span className="max-w-[140px] truncate">{selected.label}</span>
				<ChevronDown className="size-3 opacity-40" strokeWidth={2} />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="top"
				align="start"
				sideOffset={4}
				className="min-w-[12rem]"
			>
				{accounts.map((account) => (
					<DropdownMenuItem
						key={account.id}
						onClick={() => onSelect(account.configDir)}
						className="flex items-center justify-between gap-3"
					>
						<span className="truncate">{account.label}</span>
						{account.configDir === selected.configDir ? (
							<span className="text-mini text-foreground">✓</span>
						) : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
