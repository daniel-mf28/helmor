import { targetTripleFromEnv } from "../../scripts/build-platform.js";

export type DarwinArch = "arm64" | "x64";
export type ReleaseArch = "arm64" | "amd64";

export interface TargetInfo {
	/** Target OS — Windows changes archive formats, `.exe` suffixes, and naming. */
	os: "darwin" | "windows";
	arch: DarwinArch;
	/** `@anthropic-ai/claude-code-darwin-<arch>` is the platform sub-package. */
	claudeCodePkg: string;
	/** claude-code npm tarball suffix: `darwin-arm64` / `darwin-x64`. */
	claudeCodeNpmSuffix: string;
	/** `@openai/codex-darwin-<arch>` is the npm optional-dep package. */
	codexPkg: string;
	/** Target triple inside the codex platform package. */
	codexTriple: string;
	/** Codex npm tarball suffix: `darwin-arm64` / `darwin-x64`. */
	codexNpmSuffix: string;
	/** `gh` release naming: `arm64` / `amd64`. */
	ghArch: ReleaseArch;
}

export interface ArchivePlan {
	slug: string;
	archiveName: string;
	url: string;
	sha256: string;
}

export const GH_VERSION = "2.95.0";
export const GH_SHA256 = {
	arm64: "3677f9c27965825f9c7d50395473c134edaea4b484373ef6b25de653570a0489",
	amd64: "985707e9ac60c95ed51cddd808c338b481abe69fffa77e9d6547c3750045f77e",
} as const;

export const CODEX_SHA256: Readonly<
	Record<string, { arm64: string; x64: string }>
> = {
	"0.130.0": {
		arm64: "f6fef2ceee8977079ad3b3296b4c14c2707934e6b4ec1aa1a32d6e512196b12d",
		x64: "21f161ffd79fab88c5bd91e40d14c894fe6d4ad61ea4ebc80d4fcf20130960c2",
	},
	"0.134.0": {
		arm64: "82c8bd152cdfb8175fd03d1d18ac0f8cddce22a7e68164572c107f628b0d8b7c",
		x64: "fd518e72bb6f77d2183799b0be00e77d8cc1b465c06e7e129f69028218259a64",
	},
	"0.139.0": {
		arm64: "ef8fc3766c3930b52ca95e54ee5486569e24327d71bc10e796fad3ace4920fab",
		x64: "b70305a6b03113e48e73d37a1653123d30d20d1287ecebd1ecb75993c22ea78c",
	},
	"0.142.0": {
		arm64: "775a564ea8a15a2959cd2bd5c5540ded68e35af2aa246f7d7e3e87b7a530aaae",
		x64: "34a6e122ce6ce810f3f4dda43592d8f294f0722aa836809f2ed320b7b19b04a6",
	},
	"0.142.4": {
		arm64: "3c11cfcf3bd46771421ba820a224c856b1167d094715d26f1da55f47c7b8726c",
		x64: "27c89c8f8c682e8d7db72919186b0fed4bb45c947500b5a77e05d7bed89d0b9c",
	},
	"0.142.5": {
		arm64: "51f8db517b93a086e8bca7a108cac81a313a6eebcfb3336ca105bae49f11776c",
		x64: "f3ef09ed3e5f3140888210109a725e0502922b34da18a9dd00c5581d5015d4f9",
	},
	"0.144.0": {
		arm64: "cb744fdc070465597c58d058bf11d04b4c8ed35952e4d9ce3beeca9216d8580d",
		x64: "fdd8158fdd0088fe577f2811b8f09b01be09907a0d63bbd8b3a658e4ee96dda0",
	},
	"0.144.3": {
		arm64: "d9779cc540a5dbe9ee7cf62bd2848962c26b8d5b6fbcbbb1389ccd0ff84fdb24",
		x64: "8c2733ac55cdc9d0b69f20130fda68aea69373bea3da5f28f8edbf5b2a811e59",
	},
	"0.144.4": {
		arm64: "5263018fad27784e1ee3ebfaa3aae0a3bbf0edd9190068b09db9fbf28cbfa48e",
		x64: "6cf286232e98fe9dd0b92171442ecc44d533113a4cb998356ae59de9f7dd780c",
	},
	"0.144.5": {
		arm64: "2931f22a00e1b52a95416a97db0be3beeb4020924f04eab0d3313f02d0400343",
		x64: "c0b8dae311275c3441a6dae84d1562035d0118945f58ab7288603a11ed7b0655",
	},
	"0.144.6": {
		arm64: "671d58a58cd2058345b9d9e4a969bb69937e50c7c1cd57c6061ed674dc92f94b",
		x64: "6f1cdab2dd23beb5bfdb82a7d4ff5bb8c33f29af5d1019778b18584ea7c53165",
	},
	"0.145.0": {
		arm64: "53ff1055d35ca3dc964e8bedc2431e46c00608f7c8e145b222122648a7a4e3e8",
		x64: "642f0d23f13240526e306e7b9e8e1de2c0b251330b07ee25999bb6078b6401af",
	},
	// >= 0.153.1 is the floor for `gpt-6-astra`.
	"0.154.0": {
		arm64: "2a98662d79316a59993c7233e3e25a1aa1d42da4b45904585d33a5a7da1cade1",
		x64: "92c493533c53c433c4d94252251daba4f379ccba06a9964d260abb47a535dce1",
	},
	// >= 0.155.0 is the floor for `gpt-6-sol` / `gpt-6-luna` (the model
	// catalog hides both from older clients).
	"0.155.1": {
		arm64: "93cc218b25b71c8da3edb50a013fbd22acf8f39058fb64083fefff638a084976",
		x64: "819db6dbb57a56cc21383a30331fc4115696e02f4c47ba7f686a285a2173fadd",
	},
};

export const CLAUDE_CODE_SHA256: Readonly<
	Record<string, { arm64: string; x64: string }>
> = {
	"2.1.139": {
		arm64: "ed9a4c64c8b5374da8389ff6aa4b58fce7a792f90ef2261a14445d9082a80799",
		x64: "71d18ce1d457f37b427bdcb5933424c83bf22b39b2b7628415028585b832fe6c",
	},
	"2.1.154": {
		arm64: "2394afa765253caaac8cb030c7954650c4052b537aacc664c634d6397bed064a",
		x64: "95643be424f07808e7b67195695191b05d0edc6ad7c3c274424dfb062c875fb5",
	},
	"2.1.170": {
		arm64: "95d699dd2f03827e95286fe854999d42e3d0bfeec37af88c5bf49908ee56aa53",
		x64: "f3e63255173dc3a9fcaa4cbe945b87454c8530e5d245affcd5b207b20c3e8bb0",
	},
	"2.1.173": {
		arm64: "f9fbce58073a202963872c78a69ade5dae679ff4318b7b1c0bccea8b42df1953",
		x64: "cd44b111c2d767c8fc01e2af7a44f5ca54219c115e3533d0e7e2d19397e8cf9a",
	},
	"2.1.186": {
		arm64: "80468642f9984690294d45bb1bdf9e7c6d99c57a1a0fdda42a306fb3b4ce83b4",
		x64: "26b0043739a2fad6ad042f6aaabd8a878167e4bf7c7a7e2ab28af20cc9532570",
	},
	"2.1.191": {
		arm64: "4abdd760857cc2f48d79e2c23dbef82b27369ce13840dab977c33e53608b56ee",
		x64: "d33fc94637a6524dfe986d5d895c76b9d80f4c1554315ca20c1c57d8bc5ea35c",
	},
	"2.1.197": {
		arm64: "f5a7b05f69c3ab84c224be287c1859781f7abf77c08dff48fb100efffa76be6e",
		x64: "8b70562c29fcc6b0b521106125b08a9e012a6cd05d5c7b87b0314f0ad3dae2b1",
	},
	"2.1.202": {
		arm64: "18faddfb6b9ef208a727bfe5bc5e01f53892d8fa2fb0d473c4ce98532f360372",
		x64: "81a7fc473545a52e7775bc0c39cd5a2878443266a97850baa6048961c25c31a0",
	},
	"2.1.205": {
		arm64: "2491465de769953037bb8fd315aafecbe3607325b1fb07efbae4ca7bd5540b28",
		x64: "bb6ae310787ca341ff6cef1e95ba9e610082ef5ce5bc1ed88893207800b0970b",
	},
	"2.1.207": {
		arm64: "49559d5e1debf69b52289ac867faaa64efcfd7c47810fca347fa0697e578153c",
		x64: "6302286147ea0abfe9ac632b665a76820ea11e54328101c7f4e13767ca0046dc",
	},
	"2.1.210": {
		arm64: "b9236e01dbeaed510aeee243696e80cd7c66ecccd8bc03aa83a03e2696912334",
		x64: "8c3c628628ef8c25fd401e4b6f25eefadcf2285a09f68d6be02173a4260a781d",
	},
	"2.1.211": {
		arm64: "df2dae92225ee07170e466ce4aa8a14d9eadd9db84d1cfd7adc9f3f2a9106e3b",
		x64: "acc8c9452f27748f4a0c9aaf4543834bdf026801d848ee0566e19ee3e2ec3267",
	},
	"2.1.212": {
		arm64: "f4f9c250374bb79b3569e4912a7aea4476372ddad5c1e2491f0fcb25c68080cc",
		x64: "259fda74f0cf24aa4ea0b6746c6740bd9803c2822309179d5b02572b95e4848e",
	},
	"2.1.214": {
		arm64: "063331d0cf00f73f21a2f94d779788c1a1ce783d2f11286a2b5fc77cfaaba6bb",
		x64: "2ae460168deef91ebd13ab71f58b060173e44d84484d8b7bc546544b045d910b",
	},
	"2.1.215": {
		arm64: "b5dd6a135c96957dae232218c4ae5b04328a788f8c509202c92a2fec550601b2",
		x64: "2a589f44e9d3def29e3977e804cc32f55f6643e553d2cf190a9378760f92e378",
	},
	"2.1.217": {
		arm64: "748221efe210b823b85cbf4225206519c014408a2f80174aa7156fc2a873c7b5",
		x64: "b35a5c2b892ce774a6c71c156fbc50db1629908929b1332f9d881eb5965502ef",
	},
	"2.1.219": {
		arm64: "36a0a1e56ac982f3122c88fc836f69a9d139975ceb9b5ddf44e2b01f75998bda",
		x64: "970f8f3c79063f0dae7e42fe7876c14e2c704764409cf814bb21b48a068c4dc8",
	},
	// 2.1.280 is the floor for `claude-opus-5-5` (it landed there and became
	// the CLI's default Opus).
	"2.1.280": {
		arm64: "76170ceef79015e118fdea65e3b11663342153d3559f301ab8e6a7dfecc7f4a3",
		x64: "8e19957ce6ac24677a3cb2a7b2b717fbbe36db3871a3e84d534fb0cbdfe02d6f",
	},
	// 2.1.284 is the floor for `claude-sonnet-5-5` (first release that lists
	// it; it also became the CLI's `sonnet` alias there).
	"2.1.284": {
		arm64: "a08ca0629e314e744d0779fb2968a5c3adcf8c889b0a9ad9fe2b5d6dd76f46a4",
		x64: "a4caf5e442a59251f51203639f54c2f1e2121b185731110609d07dde16f3bfa2",
	},
};

export const LLAMA_VERSION = "b9763";
export const LLAMA_SHA256: Readonly<{ arm64: string; x64: string }> = {
	arm64: "7706d1a7630218a3665d8c2d680bb54ab7f101896e9c45caaf5676ef4ce2e2d0",
	x64: "8ce3ef62326d1359958352e56c4926d57ef4345b87b44b16fba263a4f66ef4e3",
};

const TARGETS: Readonly<Record<DarwinArch, TargetInfo>> = {
	arm64: {
		os: "darwin",
		arch: "arm64",
		claudeCodePkg: "@anthropic-ai/claude-code-darwin-arm64",
		claudeCodeNpmSuffix: "darwin-arm64",
		codexPkg: "@openai/codex-darwin-arm64",
		codexTriple: "aarch64-apple-darwin",
		codexNpmSuffix: "darwin-arm64",
		ghArch: "arm64",
	},
	x64: {
		os: "darwin",
		arch: "x64",
		claudeCodePkg: "@anthropic-ai/claude-code-darwin-x64",
		claudeCodeNpmSuffix: "darwin-x64",
		codexPkg: "@openai/codex-darwin-x64",
		codexTriple: "x86_64-apple-darwin",
		codexNpmSuffix: "darwin-x64",
		ghArch: "amd64",
	},
};

/** Windows x64 target. Only x64 is supported (no ARM64 Windows). Pulls the
 *  platform sub-packages bun already installed into node_modules. */
const WINDOWS_X64_TARGET: TargetInfo = {
	os: "windows",
	arch: "x64",
	claudeCodePkg: "@anthropic-ai/claude-code-win32-x64",
	claudeCodeNpmSuffix: "win32-x64",
	// On Windows the codex binary lives in the platform sub-package, not the
	// umbrella @openai/codex package (whose vendor dir is empty).
	codexPkg: "@openai/codex-win32-x64",
	codexTriple: "x86_64-pc-windows-msvc",
	codexNpmSuffix: "win32-x64",
	ghArch: "amd64",
};

export function targetInfoForArch(arch: DarwinArch): TargetInfo {
	return TARGETS[arch];
}

export function resolveVendorTarget(options?: {
	hostPlatform?: NodeJS.Platform;
	hostArch?: string;
	env?: Record<string, string | undefined>;
}): TargetInfo {
	const hostPlatform = options?.hostPlatform ?? process.platform;

	// Windows: stage the x64 sub-packages bun installed into node_modules. No
	// cross-arch matrix (TAURI_TARGET_TRIPLE is a macOS-CI concern), so the host
	// arch is the target.
	if (hostPlatform === "win32") {
		const hostArch = options?.hostArch ?? process.arch;
		if (hostArch !== "x64") {
			throw new Error(
				`[stage-vendor] unsupported Windows host arch: ${hostArch} (only x64)`,
			);
		}
		return WINDOWS_X64_TARGET;
	}

	if (hostPlatform !== "darwin") {
		throw new Error(
			`[stage-vendor] Helmor only builds on macOS and Windows; host platform is ${hostPlatform}`,
		);
	}

	const triple = targetTripleFromEnv(options?.env ?? process.env);
	if (triple) {
		if (triple === "aarch64-apple-darwin") return targetInfoForArch("arm64");
		if (triple === "x86_64-apple-darwin") return targetInfoForArch("x64");
		throw new Error(
			`[stage-vendor] unsupported TAURI_TARGET_TRIPLE for macOS: ${triple}`,
		);
	}

	const hostArch = options?.hostArch ?? process.arch;
	if (hostArch === "arm64") return targetInfoForArch("arm64");
	if (hostArch === "x64") return targetInfoForArch("x64");
	throw new Error(`[stage-vendor] unsupported macOS host arch: ${hostArch}`);
}

export function ghArchivePlan(target: TargetInfo): ArchivePlan {
	const arch = target.ghArch;
	// gh ships macOS as `gh_<ver>_macOS_<arch>.zip` and Windows as
	// `gh_<ver>_windows_<arch>.zip`; both nest `bin/gh[.exe]`. Windows has no
	// pinned sha256 (soft-verify), so leave it empty.
	if (target.os === "windows") {
		const slug = `gh_${GH_VERSION}_windows_${arch}`;
		return {
			slug,
			archiveName: `${slug}.zip`,
			url: `https://github.com/cli/cli/releases/download/v${GH_VERSION}/${slug}.zip`,
			sha256: "",
		};
	}
	const slug = `gh_${GH_VERSION}_macOS_${arch}`;
	return {
		slug,
		archiveName: `${slug}.zip`,
		url: `https://github.com/cli/cli/releases/download/v${GH_VERSION}/${slug}.zip`,
		sha256: GH_SHA256[arch],
	};
}

export function claudeCodeArchivePlan(
	target: TargetInfo,
	version: string,
): ArchivePlan {
	const shaTable = CLAUDE_CODE_SHA256[version];
	if (!shaTable) {
		throw new Error(
			`[stage-vendor] no pinned SHA256 for claude-code ${version} — add it to CLAUDE_CODE_SHA256 in vendor-platform.ts`,
		);
	}
	const slug = `claude-code-${target.claudeCodeNpmSuffix}-${version}`;
	return {
		slug,
		archiveName: `${slug}.tgz`,
		url: `https://registry.npmjs.org/${target.claudeCodePkg}/-/claude-code-${target.claudeCodeNpmSuffix}-${version}.tgz`,
		sha256: shaTable[target.arch],
	};
}

export function codexArchivePlan(
	target: TargetInfo,
	version: string,
): ArchivePlan {
	const shaTable = CODEX_SHA256[version];
	if (!shaTable) {
		throw new Error(
			`[stage-vendor] no pinned SHA256 for codex ${version} — add it to CODEX_SHA256 in vendor-platform.ts`,
		);
	}
	const slug = `codex-${version}-${target.codexNpmSuffix}`;
	return {
		slug,
		archiveName: `${slug}.tgz`,
		url: `https://registry.npmjs.org/@openai/codex/-/${slug}.tgz`,
		sha256: shaTable[target.arch],
	};
}

export function llamaArchivePlan(target: TargetInfo): ArchivePlan {
	// Windows: upstream ships `llama-<ver>-bin-win-cpu-x64.zip` (server + CLIs +
	// their `.dll`s). No pinned sha256 (soft-verify), so leave it empty.
	if (target.os === "windows") {
		const slug = `llama-${LLAMA_VERSION}-bin-win-cpu-x64`;
		return {
			slug,
			archiveName: `${slug}.zip`,
			url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_VERSION}/${slug}.zip`,
			sha256: "",
		};
	}
	const archSlug = target.arch === "arm64" ? "macos-arm64" : "macos-x64";
	const slug = `llama-${LLAMA_VERSION}-bin-${archSlug}`;
	return {
		slug,
		archiveName: `${slug}.tar.gz`,
		url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_VERSION}/${slug}.tar.gz`,
		sha256: LLAMA_SHA256[target.arch],
	};
}
