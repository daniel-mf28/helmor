import { describe, expect, test } from "bun:test";
import { parseWindowsRegistryPathValue } from "../src/agent-path-env.js";
import {
	buildCodexAppServerArgs,
	buildCodexEnv,
} from "../src/codex/app-server.js";

describe("buildCodexAppServerArgs", () => {
	test("disables native notify hooks for embedded app-server sessions", () => {
		expect(buildCodexAppServerArgs()).toEqual([
			"app-server",
			"-c",
			"notify=[]",
		]);
	});

	test("merges Windows machine and user PATH into spawned Codex env", () => {
		const env = buildCodexEnv("C:\\tools\\codex\\bin\\codex.exe", {
			baseEnv: {
				Path: "C:\\Existing\\bin;C:\\Users\\dildev\\bin",
				SystemRoot: "C:\\Windows",
				USERPROFILE: "C:\\Users\\dildev",
			},
			pathExists: (path) => path.endsWith("codex-path"),
			platform: "win32",
			readWindowsRegistryPath: (scope) =>
				scope === "machine"
					? "%SystemRoot%\\System32;C:\\Machine\\Tools"
					: "%USERPROFILE%\\bin;C:\\Existing\\bin",
		});

		const path = env.Path?.split(";") ?? [];
		expect(path[0]?.endsWith("codex-path")).toBe(true);
		expect(path.slice(1)).toEqual([
			"C:\\Windows\\System32",
			"C:\\Machine\\Tools",
			"C:\\Users\\dildev\\bin",
			"C:\\Existing\\bin",
		]);
		expect(env.PATH).toBeUndefined();
	});

	test("keeps non-Windows PATH behavior unchanged", () => {
		let registryRead = false;
		const env = buildCodexEnv("/tmp/codex", {
			baseEnv: { PATH: "/usr/bin" },
			pathExists: () => false,
			platform: "linux",
			readWindowsRegistryPath: () => {
				registryRead = true;
				return undefined;
			},
		});

		expect(env.PATH).toBe("/usr/bin");
		expect(registryRead).toBe(false);
	});

	test("parses Windows registry PATH query output", () => {
		expect(
			parseWindowsRegistryPathValue(`
HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment
    Path    REG_EXPAND_SZ    %SystemRoot%\\System32;C:\\Tools
`),
		).toBe("%SystemRoot%\\System32;C:\\Tools");
	});
});
