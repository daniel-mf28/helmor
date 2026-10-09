import { open as openDirectoryDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Plus, ScanSearch, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { detectClaudeConfigDirs, normalizeClaudeConfigDir } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { type ClaudeAccountSetting, useSettings } from "@/lib/settings";

function folderName(dir: string): string {
	const parts = dir.split(/[\\/]/).filter(Boolean);
	return parts[parts.length - 1] ?? dir;
}

/** Label guess for a folder like `~/.claude-personal` -> "Personal". */
export function suggestAccountLabel(dir: string): string {
	const suffix = folderName(dir).replace(/^\.?claude-?/i, "");
	const words = suffix.split(/[-_]+/).filter(Boolean);
	if (words.length === 0) return folderName(dir);
	return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function newAccountId(): string {
	return crypto.randomUUID().slice(0, 8);
}

/** "Claude accounts" settings block: rename the default account, add/remove
 *  extra accounts (a Claude config folder each), and re-scan `~/.claude-*`. */
export function ClaudeAccountsEditor() {
	const { t } = useI18n();
	const { settings, updateSettings } = useSettings();
	const [newLabel, setNewLabel] = useState("");
	const [newPath, setNewPath] = useState("");
	const [message, setMessage] = useState<string | null>(null);

	const accounts = settings.claudeAccounts;

	const saveAccounts = (next: ClaudeAccountSetting[]) =>
		updateSettings({ claudeAccounts: next });

	async function addAccount(rawPath: string, rawLabel: string) {
		setMessage(null);
		let configDir: string;
		try {
			configDir = await normalizeClaudeConfigDir(rawPath);
		} catch {
			setMessage(t("claudeAccountFolderInvalid"));
			return false;
		}
		if (accounts.some((account) => account.configDir === configDir)) {
			setMessage(t("claudeAccountAlreadyAdded"));
			return false;
		}
		const label = rawLabel.trim() || suggestAccountLabel(configDir);
		await saveAccounts([...accounts, { id: newAccountId(), label, configDir }]);
		return true;
	}

	async function handleAdd() {
		if (!newPath.trim()) return;
		if (await addAccount(newPath, newLabel)) {
			setNewLabel("");
			setNewPath("");
		}
	}

	async function handleBrowse() {
		try {
			const selected = await openDirectoryDialog({
				directory: true,
				multiple: false,
			});
			if (typeof selected === "string") {
				setNewPath(selected);
				if (!newLabel.trim()) setNewLabel(suggestAccountLabel(selected));
			}
		} catch {
			// Dialog unavailable (non-Tauri env) — the text field still works.
		}
	}

	async function handleScan() {
		setMessage(null);
		try {
			const found = await detectClaudeConfigDirs();
			const known = new Set(accounts.map((account) => account.configDir));
			const fresh = found.filter((item) => !known.has(item.configDir));
			if (fresh.length === 0) {
				setMessage(t("claudeAccountsNoneFound"));
				return;
			}
			await saveAccounts([
				...accounts,
				...fresh.map((item) => ({
					id: newAccountId(),
					label: item.label,
					configDir: item.configDir,
				})),
			]);
		} catch {
			setMessage(t("claudeAccountsNoneFound"));
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<Input
					aria-label="claudeDefaultAccountName"
					defaultValue={settings.claudeDefaultAccountLabel}
					key={settings.claudeDefaultAccountLabel}
					className="w-32 shrink-0"
					onBlur={(event) => {
						const next = event.target.value.trim();
						if (next && next !== settings.claudeDefaultAccountLabel) {
							void updateSettings({ claudeDefaultAccountLabel: next });
						} else {
							event.target.value = settings.claudeDefaultAccountLabel;
						}
					}}
				/>
				<span className="min-w-0 flex-1 truncate font-mono text-small text-muted-foreground">
					~/.claude
				</span>
			</div>

			{accounts.map((account) => (
				<div key={account.id} className="flex items-center gap-2">
					<Input
						aria-label="claudeAccountName"
						defaultValue={account.label}
						key={`${account.id}:${account.label}`}
						className="w-32 shrink-0"
						onBlur={(event) => {
							const next = event.target.value.trim();
							if (next && next !== account.label) {
								void saveAccounts(
									accounts.map((a) =>
										a.id === account.id ? { ...a, label: next } : a,
									),
								);
							} else {
								event.target.value = account.label;
							}
						}}
					/>
					<span
						className="min-w-0 flex-1 truncate font-mono text-small text-muted-foreground"
						title={account.configDir}
					>
						{account.configDir}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="removeAccount"
						onClick={() =>
							void saveAccounts(accounts.filter((a) => a.id !== account.id))
						}
					>
						<X className="size-3.5" />
					</Button>
				</div>
			))}

			<div className="flex items-center gap-2 pt-1">
				<Input
					aria-label="claudeAccountName"
					placeholder="claudeAccountNamePlaceholder"
					value={newLabel}
					className="w-32 shrink-0"
					onChange={(event) => setNewLabel(event.target.value)}
				/>
				<Input
					aria-label="claudeAccountFolder"
					placeholder="claudeAccountFolderPlaceholder"
					value={newPath}
					className="flex-1 font-mono"
					onChange={(event) => setNewPath(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") void handleAdd();
					}}
				/>
				<Button
					type="button"
					variant="outline"
					size="icon-sm"
					aria-label="browseFolder"
					onClick={() => void handleBrowse()}
				>
					<FolderOpen className="size-3.5" />
				</Button>
			</div>
			<div className="flex items-center justify-end gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => void handleScan()}
				>
					<ScanSearch className="size-3.5" />
					{t("scanForAccounts")}
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!newPath.trim()}
					onClick={() => void handleAdd()}
				>
					<Plus className="size-3.5" />
					{t("addAccount")}
				</Button>
			</div>
			{message ? (
				<div className="text-small text-muted-foreground">{message}</div>
			) : null}
		</div>
	);
}
