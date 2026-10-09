export function storedObject<T>(Value: unknown): T | null {
	return typeof Value === 'object' && Value !== null && !Array.isArray(Value) ? (Value as T) : null;
}

export function storedIds(Value: unknown): number[] {
	return Array.isArray(Value) ? Value.filter((Id): Id is number => typeof Id === 'number') : [];
}

export class BoundedStore<T> {
	constructor(
		private readonly Prefix: string,
		private readonly Max: number
	) {}

	async get(Id: number): Promise<T | null> {
		const Key = this.keyFor(Id);
		const Stored = await chrome.storage.local.get(Key);
		return storedObject<T>(Stored[Key]);
	}

	async getMany(Ids: number[]): Promise<Map<number, T>> {
		const Found = new Map<number, T>();
		if (Ids.length === 0) return Found;
		const Stored = await chrome.storage.local.get(Ids.map((Id) => this.keyFor(Id)));
		for (const Id of Ids) {
			const Value = storedObject<T>(Stored[this.keyFor(Id)]);
			if (Value) Found.set(Id, Value);
		}
		return Found;
	}

	async put(Id: number, Value: T): Promise<void> {
		const IndexKey = `${this.Prefix}Index`;
		const Stored = await chrome.storage.local.get(IndexKey);
		const Next = [Id, ...storedIds(Stored[IndexKey]).filter((Existing) => Existing !== Id)];
		const Evicted = Next.splice(this.Max);
		await chrome.storage.local.set({ [this.keyFor(Id)]: Value, [IndexKey]: Next });
		if (Evicted.length > 0) await chrome.storage.local.remove(Evicted.map((Old) => this.keyFor(Old)));
	}

	private keyFor(Id: number): string {
		return `${this.Prefix}:${Id}`;
	}
}
