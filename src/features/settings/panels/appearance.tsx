import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { I18nText, useI18n } from "@/lib/i18n";
import { APP_LANGUAGE_OPTIONS, type AppLanguage } from "@/lib/i18n/types";
import {
	type AppSettings,
	type ColorTheme,
	resolveTheme,
	type ThemeMode,
} from "@/lib/settings";
import { cn } from "@/lib/utils";
import { FontPicker } from "../components/font-picker";
import { FontSizeStepper } from "../components/font-size-stepper";
import { SettingsGroup, SettingsRow } from "../components/settings-row";
import { SettingsSelect } from "../components/settings-select";

type ColorThemeOption = {
	id: ColorTheme;
	label: string;
	bg: string;
	accent: string;
	lightBg: string;
	lightAccent: string;
	mode?: "light" | "dark";
};

/// Swatch tints for the Color Theme picker. Two stops per side so each
/// preset reads as a distinct gradient circle — vivid in dark mode,
/// softer in light mode.
const COLOR_THEME_OPTIONS: readonly ColorThemeOption[] = [
	{
		id: "default",
		label: "default",
		bg: "oklch(0.38 0 0)",
		accent: "oklch(0.18 0 0)",
		lightBg: "oklch(0.88 0 0)",
		lightAccent: "oklch(0.52 0 0)",
	},
	{
		id: "midnight",
		label: "midnight",
		bg: "oklch(0.62 0.14 258)",
		accent: "oklch(0.30 0.10 260)",
		lightBg: "oklch(0.82 0.09 258)",
		lightAccent: "oklch(0.46 0.20 255)",
	},
	{
		id: "aurora",
		label: "aurora",
		bg: "oklch(0.60 0.15 286)",
		accent: "oklch(0.28 0.09 292)",
		lightBg: "oklch(0.80 0.10 289)",
		lightAccent: "oklch(0.46 0.20 284)",
	},
	{
		id: "aubergine",
		label: "aubergine",
		bg: "oklch(0.46 0.20 295)",
		accent: "oklch(0.22 0.06 320)",
		lightBg: "oklch(0.84 0.06 320)",
		lightAccent: "oklch(0.46 0.20 295)",
	},
	{
		id: "hoth",
		label: "hoth",
		bg: "oklch(0.55 0.05 230)",
		accent: "oklch(0.25 0.02 230)",
		lightBg: "oklch(0.86 0.02 230)",
		lightAccent: "oklch(0.55 0.13 235)",
	},
	{
		id: "ink-coral",
		label: "inkCoral",
		bg: "oklch(0.24 0.029 253)",
		accent: "oklch(0.76 0.14 28)",
		lightBg: "oklch(0.9 0.013 252)",
		lightAccent: "oklch(0.52 0.16 25)",
	},
	{
		id: "catppuccin-latte",
		label: "catppuccinLatte",
		bg: "oklch(0.958 0.006 264.5)",
		accent: "oklch(0.555 0.250 297)",
		lightBg: "oklch(0.958 0.006 264.5)",
		lightAccent: "oklch(0.555 0.250 297)",
		mode: "light",
	},
	{
		id: "catppuccin-frappe",
		label: "catppuccinFrappe",
		bg: "oklch(0.329 0.032 274.8)",
		accent: "oklch(0.765 0.111 311.7)",
		lightBg: "oklch(0.329 0.032 274.8)",
		lightAccent: "oklch(0.765 0.111 311.7)",
		mode: "dark",
	},
	{
		id: "catppuccin-macchiato",
		label: "catppuccinMacchiato",
		bg: "oklch(0.279 0.035 276.9)",
		accent: "oklch(0.772 0.126 303.9)",
		lightBg: "oklch(0.279 0.035 276.9)",
		lightAccent: "oklch(0.772 0.126 303.9)",
		mode: "dark",
	},
	{
		id: "catppuccin-mocha",
		label: "catppuccinMocha",
		bg: "oklch(0.243 0.030 283.9)",
		accent: "oklch(0.787 0.119 304.8)",
		lightBg: "oklch(0.243 0.030 283.9)",
		lightAccent: "oklch(0.787 0.119 304.8)",
		mode: "dark",
	},
];

function ThemeSwatch({
	option,
	isLight,
	size = 18,
}: {
	option: ColorThemeOption;
	isLight: boolean;
	size?: number;
}) {
	const bg = isLight ? option.lightBg : option.bg;
	const accent = isLight ? option.lightAccent : option.accent;
	return (
		<span
			aria-hidden="true"
			className="block shrink-0 rounded-full"
			style={{
				width: size,
				height: size,
				background: `linear-gradient(135deg, ${bg}, ${accent})`,
			}}
		/>
	);
}

function ColorThemePicker({
	value,
	isLight,
	onChange,
}: {
	value: ColorTheme;
	isLight: boolean;
	onChange: (next: ColorTheme) => void;
}) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const visibleOptions = COLOR_THEME_OPTIONS.filter(
		(option) => !option.mode || option.mode === (isLight ? "light" : "dark"),
	);
	const current =
		visibleOptions.find((o) => o.id === value) ?? visibleOptions[0];

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className="h-8 w-[180px] justify-between gap-2 px-2 text-ui font-normal"
				>
					<span className="flex min-w-0 items-center gap-2">
						<ThemeSwatch option={current} isLight={isLight} size={16} />
						<span className="truncate">{t(current.label)}</span>
					</span>
					<ChevronDown
						className="size-3.5 shrink-0 text-muted-foreground"
						strokeWidth={1.8}
					/>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" sideOffset={4} className="w-[220px] p-1">
				<div role="listbox" className="flex flex-col">
					{visibleOptions.map((opt) => {
						const selected = opt.id === value;
						return (
							<button
								key={opt.id}
								type="button"
								role="option"
								aria-selected={selected}
								onClick={() => {
									onChange(opt.id);
									setOpen(false);
								}}
								className={cn(
									"flex h-8 cursor-interactive items-center justify-between gap-2 rounded-md px-2 text-ui text-foreground transition-colors hover:bg-accent",
									selected && "bg-accent/60",
								)}
							>
								<span className="flex min-w-0 items-center gap-2">
									<ThemeSwatch option={opt} isLight={isLight} size={16} />
									<span className="truncate">{t(opt.label)}</span>
								</span>
								{selected ? (
									<Check
										className="size-3.5 shrink-0 text-muted-foreground"
										strokeWidth={2}
									/>
								) : null}
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}

type EffectiveFonts = {
	fontSans: string;
	fontMono: string;
	fontTerminal: string;
};

function sampleEffectiveFonts(): EffectiveFonts {
	if (typeof document === "undefined") {
		return { fontSans: "", fontMono: "", fontTerminal: "" };
	}
	const cs = getComputedStyle(document.documentElement);
	return {
		fontSans: cs.getPropertyValue("--font-sans").trim(),
		fontMono: cs.getPropertyValue("--font-mono").trim(),
		fontTerminal: cs.getPropertyValue("--font-terminal").trim(),
	};
}

export type AppearancePanelProps = {
	settings: AppSettings;
	updateSettings: (patch: Partial<AppSettings>) => void;
};

export function AppearancePanel({
	settings,
	updateSettings,
}: AppearancePanelProps) {
	// The picker edits the preset slot that matches the current effective
	// mode — `lightTheme` and `darkTheme` are persisted independently, so
	// flipping Theme between Light/Dark/System swaps which slot you see.
	const isLight = resolveTheme(settings.theme) === "light";
	const activeColorTheme = isLight ? settings.lightTheme : settings.darkTheme;
	const updateActiveColorTheme = (next: ColorTheme) =>
		updateSettings(isLight ? { lightTheme: next } : { darkTheme: next });

	// Re-sample the live font stacks each time the user changes a
	// font-affecting setting so the placeholders show what's actually
	// rendering. RAF defers one frame to let `useThemeApplication`
	// commit its DOM mutations first.
	const [effective, setEffective] =
		useState<EffectiveFonts>(sampleEffectiveFonts);
	useEffect(() => {
		const id = requestAnimationFrame(() =>
			setEffective(sampleEffectiveFonts()),
		);
		return () => cancelAnimationFrame(id);
	}, [
		settings.uiFontFamily,
		settings.codeFontFamily,
		settings.terminalFontFamily,
	]);

	return (
		<SettingsGroup>
			<SettingsRow title="language" description="chooseInterfaceLanguage">
				<SettingsSelect<AppLanguage>
					value={settings.language}
					options={APP_LANGUAGE_OPTIONS}
					onChange={(next) => updateSettings({ language: next })}
					ariaLabel="language"
				/>
			</SettingsRow>

			{/* ── Mode ─────────────────────────────────────────────────────── */}
			<SettingsRow title="theme" description="useLightDarkMatchSystem">
				<ToggleGroup
					type="single"
					value={settings.theme}
					className="gap-1.5"
					onValueChange={(value: string) => {
						if (value) updateSettings({ theme: value as ThemeMode });
					}}
				>
					{(
						[
							{ value: "light", icon: Sun, label: "light" },
							{ value: "dark", icon: Moon, label: "dark" },
							{ value: "system", icon: Monitor, label: "system" },
						] as const
					).map(({ value, icon: Icon, label }) => (
						<ToggleGroupItem
							key={value}
							value={value}
							className="gap-1.5 rounded-lg px-3 py-1.5 text-small font-medium text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
						>
							<Icon className="size-3.5" strokeWidth={1.8} />
							<I18nText source={label} />
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</SettingsRow>

			{/* ── Color theme ──────────────────────────────────────────────── */}
			<SettingsRow title="colorTheme" description="chooseAccentPalette">
				<ColorThemePicker
					value={activeColorTheme}
					isLight={isLight}
					onChange={updateActiveColorTheme}
				/>
			</SettingsRow>

			{/* ── Chat font size ────────────────────────────────────────────── */}
			<SettingsRow title="chatFontSize" description="sizeUsedChatMessageBodies">
				<FontSizeStepper
					value={settings.chatFontSize}
					onChange={(next) => updateSettings({ chatFontSize: next })}
					min={12}
					max={24}
					ariaLabel="chatFontSize"
				/>
			</SettingsRow>

			{/* ── Fonts (free-form text inputs) ─────────────────────────────── */}
			<SettingsRow title="uiFont">
				<FontPicker
					value={settings.uiFontFamily}
					onChange={(next) => updateSettings({ uiFontFamily: next })}
					effectivePlaceholder={effective.fontSans}
					ariaLabel="settingsUiFontFamily"
				/>
			</SettingsRow>

			<SettingsRow title="codeFont">
				<FontPicker
					value={settings.codeFontFamily}
					onChange={(next) => updateSettings({ codeFontFamily: next })}
					effectivePlaceholder={effective.fontMono}
					ariaLabel="settingsCodeFontFamily"
				/>
			</SettingsRow>

			<SettingsRow title="terminalFont">
				<FontPicker
					value={settings.terminalFontFamily}
					onChange={(next) => updateSettings({ terminalFontFamily: next })}
					effectivePlaceholder={effective.fontTerminal}
					ariaLabel="settingsTerminalFontFamily"
				/>
			</SettingsRow>

			{/* ── Cursors ──────────────────────────────────────────────────── */}
			<SettingsRow
				title="usePointerCursors"
				description="changeCursorPointerWhenHoveringOver"
			>
				<Switch
					checked={settings.usePointerCursors}
					onCheckedChange={(checked) =>
						updateSettings({ usePointerCursors: checked })
					}
				/>
			</SettingsRow>
		</SettingsGroup>
	);
}
