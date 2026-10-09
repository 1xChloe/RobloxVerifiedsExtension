import type { ApiUserDetail } from '../Shared/ApiTypes';

const IndexKey = 'UserDetailIndex';
const MaxEntries = 200;

export interface CachedDetail {
	User: ApiUserDetail;
	SavedAt: number;
}

export class DetailCache {
	async get(UserId: number): Promise<CachedDetail | null> {
		const Key = keyFor(UserId);
		const Stored = await chrome.storage.local.get(Key);
		return (Stored[Key] as CachedDetail | undefined) ?? null;
	}

	async put(User: ApiUserDetail): Promise<void> {
		const Stored = await chrome.storage.local.get(IndexKey);
		const Index = (Stored[IndexKey] as number[] | undefined) ?? [];
		const Next = [User.userId, ...Index.filter((Id) => Id !== User.userId)];
		const Evicted = Next.splice(MaxEntries);
		await chrome.storage.local.set({ [keyFor(User.userId)]: { User, SavedAt: Date.now() }, [IndexKey]: Next });
		if (Evicted.length > 0) await chrome.storage.local.remove(Evicted.map(keyFor));
	}

	async remove(UserId: number): Promise<void> {
		await chrome.storage.local.remove(keyFor(UserId));
	}
}

function keyFor(UserId: number): string {
	return `UserDetail:${UserId}`;
}
