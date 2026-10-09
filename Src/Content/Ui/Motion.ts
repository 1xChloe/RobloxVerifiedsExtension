import { EnterClass } from './Slot';

const ReducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const CountDurationMs = 700;

export function prefersReducedMotion(): boolean {
	return ReducedMotionQuery.matches;
}

export function countUp(Target: HTMLElement, Value: number, format: (Value: number) => string): void {
	if (prefersReducedMotion() || Value <= 0) {
		Target.textContent = format(Value);
		return;
	}
	const Start = performance.now();
	const step = (Now: number) => {
		const Progress = Math.min(1, (Now - Start) / CountDurationMs);
		const Eased = 1 - (1 - Progress) ** 3;
		Target.textContent = format(Math.round(Value * Eased));
		if (Progress < 1 && Target.isConnected) requestAnimationFrame(step);
	};
	Target.textContent = format(0);
	requestAnimationFrame(step);
}

export function replayEnter(Target: Element | null): void {
	if (!Target || prefersReducedMotion()) return;
	Target.classList.remove(EnterClass);
	void (Target as HTMLElement).offsetWidth;
	Target.classList.add(EnterClass);
}
