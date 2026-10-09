import type { AnimationItem } from "lottie-web";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type FastModeLottieIconProps = {
	className?: string;
};

export function FastModeLottieIcon({ className }: FastModeLottieIconProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let cancelled = false;
		let animation: AnimationItem | null = null;

		// Load the player + animation data lazily, only when the icon mounts.
		void Promise.all([
			import("lottie-web/build/player/lottie_svg"),
			import("@/assets/pikachu-lightning.json"),
		]).then(([lottieModule, animationModule]) => {
			if (cancelled) return;
			const lottie = lottieModule.default;
			animation = lottie.loadAnimation({
				container,
				renderer: "svg",
				loop: true,
				autoplay: true,
				animationData: animationModule.default,
				rendererSettings: {
					preserveAspectRatio: "xMidYMid meet",
				},
			});
			if (typeof animation.setSpeed === "function") {
				animation.setSpeed(1.15);
			}
		});

		return () => {
			cancelled = true;
			animation?.destroy();
		};
	}, []);

	return (
		<div
			ref={containerRef}
			aria-hidden="true"
			data-testid="fast-mode-lottie-icon"
			className={cn("pointer-events-none overflow-visible", className)}
		/>
	);
}
