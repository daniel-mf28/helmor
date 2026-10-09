import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { InlineShortcutDisplay } from "@/features/shortcuts/shortcut-display";
import { I18nText } from "@/lib/i18n";
import { preloadSettings } from "./preload";

// Kept out of `index.tsx` so the sidebar can import the button without
// pulling the whole (lazy-loaded) settings dialog into the main chunk.
export function SettingsButton({
	onClick,
	shortcut,
}: {
	onClick: () => void;
	shortcut?: string | null;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClick}
					onPointerEnter={preloadSettings}
					onFocus={preloadSettings}
					className="text-muted-foreground hover:text-foreground"
				>
					<Settings className="size-[15px]" strokeWidth={1.8} />
				</Button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				sideOffset={4}
				className="flex h-[24px] items-center gap-2 rounded-md px-2 text-small leading-none"
			>
				<span className="leading-none">
					<I18nText source="settings" />
				</span>
				{shortcut ? (
					<InlineShortcutDisplay
						hotkey={shortcut}
						className="text-background/60"
					/>
				) : null}
			</TooltipContent>
		</Tooltip>
	);
}
