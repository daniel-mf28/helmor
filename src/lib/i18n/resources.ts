import en from "./locales/en.json";

export const defaultNS = "translation" as const;

export const resources = {
	en: { translation: en },
} as const;
