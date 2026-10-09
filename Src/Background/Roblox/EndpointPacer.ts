export class RateLimitedError extends Error {}

const DefaultCooldownMs = 5_000;
const MaxCooldownMs = 60_000;

export class EndpointPacer {
	private NextAt = 0;
	private CooldownUntil = 0;

	constructor(
		private readonly IntervalMs: number,
		private readonly MaxWaitMs: number,
		private readonly MinCooldownMs = DefaultCooldownMs
	) {}

	isCoolingDown(): boolean {
		return Date.now() < this.CooldownUntil;
	}

	coolDown(RetryAfterSeconds: number | null): void {
		const DurationMs = Math.min(MaxCooldownMs, Math.max(this.MinCooldownMs, (RetryAfterSeconds ?? 0) * 1000));
		this.CooldownUntil = Math.max(this.CooldownUntil, Date.now() + DurationMs);
	}

	async wait(): Promise<void> {
		const Now = Date.now();
		if (this.CooldownUntil - Now > this.MaxWaitMs) throw new RateLimitedError('Roblox is rate limiting this endpoint');
		const StartAt = Math.max(Now, this.NextAt, this.CooldownUntil);
		this.NextAt = StartAt + this.IntervalMs;
		if (StartAt > Now) await new Promise((Resolve) => setTimeout(Resolve, StartAt - Now));
	}
}
