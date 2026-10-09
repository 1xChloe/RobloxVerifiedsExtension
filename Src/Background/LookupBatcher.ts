import type { ApiUser } from '../Shared/ApiTypes';
import type { ApiClient } from './ApiClient';

const CacheTtlMs = 10 * 60_000;
const BatchWindowMs = 50;

interface CacheEntry {
	User: ApiUser | null;
	ExpiresAt: number;
}

interface Waiter {
	Promise: Promise<ApiUser | null>;
	Resolve: (User: ApiUser | null) => void;
	Reject: (Err: unknown) => void;
}

export class LookupBatcher {
	private readonly Cache = new Map<number, CacheEntry>();
	private Waiting = new Map<number, Waiter>();
	private Timer: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly getClient: () => Promise<ApiClient>) {}

	async lookup(UserIds: number[]): Promise<Map<number, ApiUser | null>> {
		const Now = Date.now();
		const Result = new Map<number, ApiUser | null>();
		const Pending: Array<Promise<void>> = [];
		for (const UserId of new Set(UserIds)) {
			const Hit = this.Cache.get(UserId);
			if (Hit && Hit.ExpiresAt > Now) Result.set(UserId, Hit.User);
			else Pending.push(this.enqueue(UserId).then((User) => void Result.set(UserId, User)));
		}
		await Promise.all(Pending);
		return Result;
	}

	clear(): void {
		this.Cache.clear();
	}

	private enqueue(UserId: number): Promise<ApiUser | null> {
		let Entry = this.Waiting.get(UserId);
		if (!Entry) {
			let Resolve!: Waiter['Resolve'];
			let Reject!: Waiter['Reject'];
			const Promised = new Promise<ApiUser | null>((Ok, Fail) => {
				Resolve = Ok;
				Reject = Fail;
			});
			Entry = { Promise: Promised, Resolve, Reject };
			this.Waiting.set(UserId, Entry);
		}
		this.Timer ??= setTimeout(() => void this.flush(), BatchWindowMs);
		return Entry.Promise;
	}

	private async flush(): Promise<void> {
		const Batch = this.Waiting;
		this.Waiting = new Map();
		this.Timer = null;
		try {
			const Users = await (await this.getClient()).lookupUsers([...Batch.keys()]);
			const ExpiresAt = Date.now() + CacheTtlMs;
			for (const [UserId, Entry] of Batch) {
				const User = Users.get(UserId) ?? null;
				this.Cache.set(UserId, { User, ExpiresAt });
				Entry.Resolve(User);
			}
		} catch (Err) {
			for (const Entry of Batch.values()) Entry.Reject(Err);
		}
	}
}
