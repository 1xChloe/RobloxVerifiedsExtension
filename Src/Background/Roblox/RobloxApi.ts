import { EndpointPacer, RateLimitedError } from './EndpointPacer';

const DetailBatchSize = 50;
const MaxUserGamePages = 3;
const MaxAttempts = 2;

const Pacers = {
	Profile: new EndpointPacer(250, 6_000),
	Badges: new EndpointPacer(500, 6_000),
	Groups: new EndpointPacer(500, 6_000),
	UserGames: new EndpointPacer(700, 6_000),
	GroupGames: new EndpointPacer(1_000, 6_000),
	GameDetails: new EndpointPacer(500, 6_000),
	Catalog: new EndpointPacer(10_000, 0, 60_000)
};

type PacerName = keyof typeof Pacers;

export interface SocialLink {
	Platform: string;
	Url: string;
}

export interface ProfileData {
	Followers: number | null;
	Friends: number | null;
	About: { Description: string; Created: string; SocialLinks: SocialLink[] } | null;
	Showcase: number[];
}

export interface Membership {
	GroupId: number;
	Name: string;
	MemberCount: number;
	HasVerifiedBadge: boolean;
	IsOwner: boolean;
	RoleName: string;
	RoleRank: number;
}

export interface GameListing {
	UniverseId: number;
	PlaceId: number;
	Name: string;
	Visits: number;
}

export interface GameList {
	Games: GameListing[];
	Truncated: boolean;
}

export interface GameDetail extends GameListing {
	Playing: number;
	Created: string | null;
	CreatorType: 'User' | 'Group';
	CreatorId: number;
	CreatorName: string;
}

export interface CatalogItem {
	Id: number;
	ItemType: 'Asset' | 'Bundle';
	Name: string;
	Favorites: number;
	CreatorName: string;
}

export interface CatalogPage {
	Items: CatalogItem[];
	HasMore: boolean;
}

interface ProfileReply {
	components?: {
		UserProfileHeader?: { counts?: { friendsCount?: number; followersCount?: number } };
		About?: {
			description?: string;
			joinDateTime?: string;
			socialLinks?: Record<string, { url?: string } | null>;
		};
		Experiences?: { experiences?: Array<{ universeId: number }> };
	};
}

interface GameListReply {
	data: Array<{ id: number; name: string; placeVisits?: number; rootPlace?: { id: number } | null }>;
	nextPageCursor: string | null;
}

export class RobloxApi {
	private CsrfToken = '';

	isCoolingDown(Pacer: PacerName): boolean {
		return Pacers[Pacer].isCoolingDown();
	}

	async profile(UserId: number): Promise<ProfileData> {
		const Reply = await this.request<ProfileReply>('Profile', 'https://apis.roblox.com/profile-platform-api/v1/profiles/get', {
			profileType: 'User',
			profileId: String(UserId),
			includeComponentOrdering: true,
			components: [{ component: 'UserProfileHeader' }, { component: 'About' }, { component: 'Experiences' }]
		});
		const Counts = Reply.components?.UserProfileHeader?.counts;
		const About = Reply.components?.About;
		return {
			Followers: typeof Counts?.followersCount === 'number' ? Counts.followersCount : null,
			Friends: typeof Counts?.friendsCount === 'number' ? Counts.friendsCount : null,
			About: About?.joinDateTime
				? {
						Description: About.description ?? '',
						Created: About.joinDateTime,
						SocialLinks: Object.entries(About.socialLinks ?? {}).flatMap(([Platform, Link]) =>
							Link?.url && /^https:\/\//i.test(Link.url) ? [{ Platform, Url: Link.url }] : []
						)
					}
				: null,
			Showcase: (Reply.components?.Experiences?.experiences ?? [])
				.map((Experience) => Experience.universeId)
				.filter((Id) => Number.isSafeInteger(Id) && Id > 0)
		};
	}

	async badgeNames(UserId: number): Promise<string[]> {
		const Reply = await this.request<Array<{ name: string }>>(
			'Badges',
			`https://accountinformation.roblox.com/v1/users/${UserId}/roblox-badges`
		);
		return Reply.map((Badge) => Badge.name);
	}

	async memberships(UserId: number): Promise<Membership[]> {
		const Reply = await this.request<{
			data: Array<{
				group: { id: number; name: string; memberCount?: number; hasVerifiedBadge?: boolean; owner?: { userId: number } | null };
				role: { name: string; rank: number };
			}>;
		}>('Groups', `https://groups.roblox.com/v1/users/${UserId}/groups/roles`);
		return Reply.data.map((Entry) => ({
			GroupId: Entry.group.id,
			Name: Entry.group.name,
			MemberCount: Entry.group.memberCount ?? 0,
			HasVerifiedBadge: Entry.group.hasVerifiedBadge ?? false,
			IsOwner: Entry.group.owner?.userId === UserId,
			RoleName: Entry.role.name,
			RoleRank: Entry.role.rank
		}));
	}

	userGames(UserId: number): Promise<GameList> {
		return this.gameList('UserGames', `https://games.roblox.com/v2/users/${UserId}/games?limit=50&sortOrder=Asc`, MaxUserGamePages);
	}

	groupGames(GroupId: number): Promise<GameList> {
		return this.gameList(
			'GroupGames',
			`https://games.roblox.com/v2/groups/${GroupId}/gamesV2?accessFilter=2&limit=50&sortOrder=Desc`,
			1
		);
	}

	async gameDetails(UniverseIds: number[]): Promise<Map<number, GameDetail>> {
		const Details = new Map<number, GameDetail>();
		const Unique = [...new Set(UniverseIds)].filter((Id) => Id > 0);
		for (let Index = 0; Index < Unique.length; Index += DetailBatchSize) {
			const Batch = Unique.slice(Index, Index + DetailBatchSize);
			const Reply = await this.request<{
				data: Array<{
					id: number;
					rootPlaceId?: number;
					name: string;
					playing?: number;
					visits?: number;
					created?: string;
					creator?: { id: number; name: string; type: string };
				}>;
			}>('GameDetails', `https://games.roblox.com/v1/games?universeIds=${Batch.join(',')}`);
			for (const Game of Reply.data) {
				Details.set(Game.id, {
					UniverseId: Game.id,
					PlaceId: Game.rootPlaceId ?? 0,
					Name: Game.name,
					Visits: Game.visits ?? 0,
					Playing: Game.playing ?? 0,
					Created: Game.created ?? null,
					CreatorType: Game.creator?.type === 'Group' ? 'Group' : 'User',
					CreatorId: Game.creator?.id ?? 0,
					CreatorName: Game.creator?.name ?? ''
				});
			}
		}
		return Details;
	}

	async catalog(CreatorType: 'User' | 'Group', CreatorId: number): Promise<CatalogPage> {
		const Reply = await this.request<{
			data: Array<{ id: number; itemType?: string; name: string; favoriteCount?: number; creatorTargetId: number; creatorName?: string }>;
			nextPageCursor: string | null;
		}>(
			'Catalog',
			`https://catalog.roblox.com/v1/search/items/details?Category=1&CreatorTargetId=${CreatorId}` +
				`&CreatorType=${CreatorType === 'User' ? 1 : 2}&SortType=1&SortAggregation=5&Limit=30`
		);
		return {
			Items: Reply.data
				.filter((Item) => Item.creatorTargetId === CreatorId)
				.map((Item) => ({
					Id: Item.id,
					ItemType: Item.itemType === 'Bundle' ? 'Bundle' : 'Asset',
					Name: Item.name,
					Favorites: Item.favoriteCount ?? 0,
					CreatorName: Item.creatorName ?? ''
				})),
			HasMore: !!Reply.nextPageCursor
		};
	}

	private async gameList(Pacer: PacerName, BaseUrl: string, MaxPages: number): Promise<GameList> {
		const Games = new Map<number, GameListing>();
		let Cursor: string | null = null;
		let Truncated = false;
		for (let Page = 0; Page < MaxPages; Page++) {
			let Reply: GameListReply;
			try {
				Reply = await this.request<GameListReply>(Pacer, Cursor ? `${BaseUrl}&cursor=${encodeURIComponent(Cursor)}` : BaseUrl);
			} catch (Err) {
				if (Page === 0) throw Err;
				Truncated = true;
				break;
			}
			for (const Game of Reply.data) {
				if (!Games.has(Game.id)) {
					Games.set(Game.id, { UniverseId: Game.id, PlaceId: Game.rootPlace?.id ?? 0, Name: Game.name, Visits: Game.placeVisits ?? 0 });
				}
			}
			Cursor = Reply.nextPageCursor;
			if (!Cursor) break;
			if (Page === MaxPages - 1) Truncated = true;
		}
		return { Games: [...Games.values()], Truncated };
	}

	private async request<T>(Pacer: PacerName, Url: string, Body?: unknown): Promise<T> {
		const Gate = Pacers[Pacer];
		for (let Attempt = 1; ; Attempt++) {
			await Gate.wait();
			let Reply = await this.send(Url, Body);
			if (Reply.status === 403 && Body !== undefined) {
				const Token = Reply.headers.get('x-csrf-token');
				if (Token && Token !== this.CsrfToken) {
					this.CsrfToken = Token;
					Reply = await this.send(Url, Body);
				}
			}
			if (Reply.status === 429) {
				const RetryAfter = Number.parseInt(Reply.headers.get('retry-after') ?? '', 10);
				Gate.coolDown(Number.isFinite(RetryAfter) ? RetryAfter : null);
				if (Attempt < MaxAttempts) continue;
				throw new RateLimitedError(`Roblox ${Pacer} is rate limited`);
			}
			if (!Reply.ok) throw new Error(`Roblox ${Reply.status} on ${Pacer}`);
			return (await Reply.json()) as T;
		}
	}

	private send(Url: string, Body?: unknown): Promise<Response> {
		const SentHeaders: Record<string, string> = { Accept: 'application/json' };
		if (Body !== undefined) {
			SentHeaders['Content-Type'] = 'application/json';
			if (this.CsrfToken) SentHeaders['X-CSRF-TOKEN'] = this.CsrfToken;
		}
		return fetch(Url, {
			method: Body === undefined ? 'GET' : 'POST',
			credentials: 'include',
			headers: SentHeaders,
			body: Body === undefined ? undefined : JSON.stringify(Body)
		});
	}
}
