import { Switch } from "@/components/ui/switch";
import { startLocalLlm } from "@/lib/api";
import { I18nText, useLocalizedNode } from "@/lib/i18n";
import type { AppSettings, LocalLlmSettings } from "@/lib/settings";

/**
 * How local-model coding chats behave: thinking on/off and whether project
 * sessions read the project's instruction files. Model-agnostic — every
 * local model gets the same two switches.
 */
export function LocalLlmBehaviorSection({
	settings,
	updateSettings,
	modelLoaded,
}: {
	settings: AppSettings;
	updateSettings: (patch: Partial<AppSettings>) => void | Promise<void>;
	/** A model is selected, so a thinking change can restart the server now. */
	modelLoaded: boolean;
}) {
	const local = settings.localLlm;
	const patch = (next: Partial<LocalLlmSettings>) =>
		updateSettings({ localLlm: { ...local, ...next } });

	return (
		<div className="flex flex-col gap-3 border-t border-border/50 pt-3">
			<BehaviorRow
				title="localLlmThinking"
				description="localLlmThinkingDescription"
				checked={local.thinking}
				onCheckedChange={async (thinking) => {
					await patch({ thinking });
					// The server is started in one thinking mode; restart it now
					// so the next message uses the new mode without waiting.
					if (modelLoaded) {
						void startLocalLlm().catch((error) => {
							console.warn("[local-llm] restart for thinking failed", error);
						});
					}
				}}
			/>
			<BehaviorRow
				title="localLlmReadProjectInstructions"
				description="localLlmReadProjectInstructionsDescription"
				checked={local.readProjectInstructions}
				onCheckedChange={(readProjectInstructions) =>
					patch({ readProjectInstructions })
				}
			/>
		</div>
	);
}

function BehaviorRow({
	title,
	description,
	checked,
	onCheckedChange,
}: {
	title: string;
	description: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void | Promise<void>;
}) {
	const label = useLocalizedNode(title);
	return (
		<div className="flex items-start justify-between gap-3">
			<div className="min-w-0 flex-1">
				<div className="text-[13px] font-medium leading-snug text-foreground">
					<I18nText source={title} />
				</div>
				<p className="mt-1 text-[12px] leading-snug text-muted-foreground">
					<I18nText source={description} />
				</p>
			</div>
			<Switch
				aria-label={typeof label === "string" ? label : title}
				checked={checked}
				onCheckedChange={(next) => void onCheckedChange(next)}
			/>
		</div>
	);
}
