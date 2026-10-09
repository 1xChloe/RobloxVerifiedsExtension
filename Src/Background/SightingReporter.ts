import type { ApiClient } from './ApiClient';

const FlushDelayMs = 5_000;

export class SightingReporter {
	private readonly Reported = new Set<number>();
	private readonly Queue = new Set<number>();
	private Timer: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly getClient: () => Promise<ApiClient>) {}

	add(UserIds: number[]): number {
		let Queued = 0;
		for (const UserId of UserIds) {
			if (this.Reported.has(UserId) || this.Queue.has(UserId)) continue;
			this.Queue.add(UserId);
			Queued++;
		}
		if (this.Queue.size > 0) this.Timer ??= setTimeout(() => void this.flush(), FlushDelayMs);
		return Queued;
	}

	private async flush(): Promise<void> {
		this.Timer = null;
		const UserIds = [...this.Queue];
		this.Queue.clear();
		if (UserIds.length === 0) return;
		try {
			await (await this.getClient()).reportSightings(UserIds);
			for (const UserId of UserIds) this.Reported.add(UserId);
		} catch (Err) {
			console.warn('[RobloxVerifieds] sighting report failed:', (Err as Error).message);
		}
	}
}
