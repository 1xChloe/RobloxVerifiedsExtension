export class BoundedStore<T> {
	constructor(
		private readonly Prefix: string,
		private readonly Max: number
	) {}

	async get(Id: number): Promise<T | null> {
		const Key = this.keyFor(Id);
		const Stored = await chrome.storage.local.get(Key);
		return (Stored[Key] as T | undefined) ?? null;
	}

	async getMany(Ids: number[]): Promise<Map<number, T>> {
		const Found = new Map<number, T>();
		if (Ids.length === 0) return Found;
		const Stored = await chrome.storage.local.get(Ids.map((Id) => this.keyFor(Id)));
		for (const Id of Ids) {
			const Value = Stored[this.keyFor(Id)] as T | undefined;
			if (Value !== undefined) Found.set(Id, Value);
		}
		return Found;
	}

	async put(Id: number, Value: T): Promise<void> {
		const IndexKey = `${this.Prefix}Index`;
		const Stored = await chrome.storage.local.get(IndexKey);
		const Index = (Stored[IndexKey] as number[] | undefined) ?? [];
		const Next = [Id, ...Index.filter((Existing) => Existing !== Id)];
		const Evicted = Next.splice(this.Max);
		await chrome.storage.local.set({ [this.keyFor(Id)]: Value, [IndexKey]: Next });
		if (Evicted.length > 0) await chrome.storage.local.remove(Evicted.map((Old) => this.keyFor(Old)));
	}

	private keyFor(Id: number): string {
		return `${this.Prefix}:${Id}`;
	}
}
