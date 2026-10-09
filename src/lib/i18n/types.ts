export type AppLanguage = "en";

export const DEFAULT_APP_LANGUAGE: AppLanguage = "en";

export const VALID_APP_LANGUAGES: readonly AppLanguage[] = ["en"];

export const APP_LANGUAGE_OPTIONS: readonly {
	value: AppLanguage;
	label: string;
}[] = [{ value: "en", label: "English" }];

export function isAppLanguage(value: unknown): value is AppLanguage {
	return (
		typeof value === "string" &&
		VALID_APP_LANGUAGES.includes(value as AppLanguage)
	);
}
