import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setAppLanguage } from "@/lib/i18n";
import packageJson from "../../../package.json";
import { ReleaseAnnouncementToastHost } from "./index";
import { LAST_SEEN_INSTALL_VERSION_STORAGE_KEY } from "./storage";

describe("ReleaseAnnouncementToastHost", () => {
	beforeEach(() => {
		window.localStorage.clear();
		setAppLanguage("en");
	});

	afterEach(() => {
		cleanup();
		setAppLanguage("en");
	});

	it("renders the release title with the version", async () => {
		window.localStorage.setItem(
			LAST_SEEN_INSTALL_VERSION_STORAGE_KEY,
			"0.40.0",
		);

		render(
			<ReleaseAnnouncementToastHost
				onOpenChangelog={() => {}}
				onOpenSettings={() => {}}
				onOpenStartPage={() => {}}
			/>,
		);

		expect(
			await screen.findByText(`New in v${packageJson.version}`),
		).toBeInTheDocument();
	});
});
