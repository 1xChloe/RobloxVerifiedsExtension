import type { ApiUserStats } from '../../Shared/ApiTypes';
import { BoundedStore } from '../BoundedStore';
import {
	EstimatorVersion,
	ReasonEstimator,
	classifyRoleTier,
	hasUncheckedRoles,
	isContributionTier,
	isHandPickedRole,
	needsRoleCheck,
	tierOrder,
	withCurrentTiers,
	type EstimateInput,
	type GameInfo,
	type GroupGameInfo,
	type GroupInfo,
	type LostRole,
	type Totals,
	type UgcInfo
} from './ReasonEstimator';
import { RobloxApi, type CatalogItem, type CatalogPage, type GameDetail, type GameList, type GameListing, type Membership } from './RobloxApi';

const StatsFreshMs = 24 * 60 * 60 * 1000;
const PartialStatsFreshMs = 60 * 60 * 1000;
const RoleRecheckMs = 10 * 60 * 1000;
const GroupListFreshMs = 12 * 60 * 60 * 1000;
const GroupCatalogFreshMs = 24 * 60 * 60 * 1000;
const MaxUgcGroups = 8;
const MaxCatalogFetches = 4;
const UgcRolePattern = /\bugcs?\b/i;
const FailureBackoffMs = 60_000;
const MaxContributionGroups = 25;
const QuickGroupFetches = 3;
const QuickPassMaxWaitMs = 2_500;
const TopCount = 5;
const UnlistableNamePattern = /^\[\s*(content deleted|title unavailable)\s*\]$/i;
const EmptyList: GameList = { Games: [], Truncated: false };

export interface LocalStatsResult {
	Stats: ApiUserStats | null;
	Pending: boolean;
	Partial: boolean;
	UpdatedAt: number | null;
}

interface StoredRole {
	GroupId: number;
	Name: string;
	RoleName: string;
	Tier: GroupInfo['Tier'];
}

interface StoredStats {
	Stats: ApiUserStats;
	Input?: EstimateInput;
	Complete?: boolean;
	Version?: number;
	Roles?: StoredRole[];
	Ugc: UgcInfo;
	GroupUgc: UgcInfo;
	Partial: boolean;
	SavedAt: number;
}

interface StoredGroupList {
	List: GameList;
	SavedAt: number;
}

interface StoredCatalog {
	Page: CatalogPage;
	SavedAt: number;
}

interface Build {
	Latest: ApiUserStats | null;
	LatestAt: number | null;
	Complete: boolean;
}

export class LocalStats {
	private readonly Api = new RobloxApi();
	private readonly Estimator = new ReasonEstimator();
	private readonly Builds = new Map<number, Build>();
	private readonly FailedAt = new Map<number, number>();
	private readonly StatsStore = new BoundedStore<StoredStats>('LocalStats', 200);
	private readonly GroupStore = new BoundedStore<StoredGroupList>('GroupGames', 400);
	private readonly CatalogStore = new BoundedStore<StoredCatalog>('GroupCatalog', 400);

	async get(UserId: number, BadgeRemoved: boolean): Promise<LocalStatsResult> {
		const Stored = await this.current(UserId, await this.StatsStore.get(UserId), BadgeRemoved);
		const Running = this.Builds.get(UserId);
		if (Running) {
			if (Running.Complete || !Stored) {
				return { Stats: Running.Latest, Pending: true, Partial: !Running.Complete && !!Running.Latest, UpdatedAt: Running.LatestAt };
			}
			return { Stats: Stored.Stats, Pending: true, Partial: false, UpdatedAt: Stored.SavedAt };
		}
		const FreshFor = Stored?.Partial ? PartialStatsFreshMs : Stored?.Input && hasUncheckedRoles(Stored.Input.Groups) ? RoleRecheckMs : StatsFreshMs;
		const RecentlyFailed = Date.now() - (this.FailedAt.get(UserId) ?? 0) < FailureBackoffMs;
		if ((Stored && Date.now() - Stored.SavedAt < FreshFor) || RecentlyFailed) {
			return { Stats: Stored?.Stats ?? null, Pending: false, Partial: false, UpdatedAt: Stored?.SavedAt ?? null };
		}
		const Progress: Build = { Latest: null, LatestAt: null, Complete: false };
		this.Builds.set(UserId, Progress);
		void this.build(UserId, BadgeRemoved, Progress, Stored)
			.catch(() => this.FailedAt.set(UserId, Date.now()))
			.finally(() => this.Builds.delete(UserId));
		return { Stats: Stored?.Stats ?? null, Pending: true, Partial: false, UpdatedAt: Stored?.SavedAt ?? null };
	}

	private async current(UserId: number, Stored: StoredStats | null, BadgeRemoved: boolean): Promise<StoredStats | null> {
		if (!Stored) return null;
		if (Stored.Version === EstimatorVersion && Stored.Input?.BadgeRemoved === BadgeRemoved) return Stored;
		if (!Stored.Input) return null;
		const Input = withCurrentTiers({ ...Stored.Input, BadgeRemoved });
		const Kept = new Set(Input.GroupGames.map((Game) => Game.GroupId));
		const Rescored: StoredStats = {
			...Stored,
			Input,
			Version: EstimatorVersion,
			Stats: {
				...Stored.Stats,
				reason: this.Estimator.estimate(Input, Stored.Complete ?? false),
				groupGames: {
					count: Input.GroupGameTotals.Count,
					visits: Input.GroupGameTotals.Visits,
					playing: Input.GroupGameTotals.Playing,
					top: Stored.Stats.groupGames.top.filter((Game) => Kept.has(Game.groupId))
				}
			}
		};
		await this.StatsStore.put(UserId, Rescored);
		return Rescored;
	}

	private async rolePicked(Member: Membership): Promise<boolean> {
		const Roles = await this.Api.groupRoles(Member.GroupId);
		const Own = Roles.find((Role) => Role.Id === Member.RoleId) ?? Roles.find((Role) => Role.Rank === Member.RoleRank && Role.Name === Member.RoleName);
		return !!Own && isHandPickedRole(Own.MemberCount, Math.max(...Roles.map((Role) => Role.MemberCount)));
	}

	private async build(UserId: number, BadgeRemoved: boolean, Progress: Build, Previous: StoredStats | null): Promise<void> {
		let Failed = 0;
		const settle = async <T>(Work: Promise<T>, Fallback: T): Promise<T> => {
			try {
				return await Work;
			} catch {
				Failed++;
				return Fallback;
			}
		};

		const [Profile, BadgeNames, Memberships, UserGames, UserCatalog] = await Promise.all([
			this.Api.profile(UserId),
			settle(this.Api.badgeNames(UserId), [] as string[]),
			this.Api.memberships(UserId),
			settle(this.Api.userGames(UserId), EmptyList),
			this.Api.isCoolingDown('Catalog') ? null : settle(this.Api.catalog('User', UserId), null)
		]);

		const Groups: GroupInfo[] = await Promise.all(
			Memberships.map(async (Member) => {
				const RolePicked = needsRoleCheck(Member.RoleRank, Member.RoleName, Member.IsOwner)
					? await settle<boolean | undefined>(this.rolePicked(Member), undefined)
					: undefined;
				return {
					GroupId: Member.GroupId,
					Name: Member.Name,
					MemberCount: Member.MemberCount,
					HasVerifiedBadge: Member.HasVerifiedBadge,
					RoleName: Member.RoleName,
					RoleRank: Member.RoleRank,
					Tier: classifyRoleTier(Member.RoleRank, Member.RoleName, Member.IsOwner, RolePicked === true),
					RolePicked,
					GameCount: 0,
					GameVisits: 0,
					GamePlaying: 0
				};
			})
		);
		const LostRoles = lostRoles(Previous?.Roles ?? [], Groups);
		const Contributing = Groups.filter((Group) => isContributionTier(Group.Tier))
			.sort((A, B) => tierOrder(A.Tier) - tierOrder(B.Tier) || B.MemberCount - A.MemberCount)
			.slice(0, MaxContributionGroups);

		const Lists = new Map<number, GameList>();
		for (const [GroupId, Saved] of await this.GroupStore.getMany(Contributing.map((Group) => Group.GroupId))) {
			if (Date.now() - Saved.SavedAt < GroupListFreshMs) Lists.set(GroupId, Saved.List);
		}
		const Missing = Contributing.filter((Group) => !Lists.has(Group.GroupId));
		const fetchLists = async (Batch: GroupInfo[]) => {
			for (const Group of Batch) {
				try {
					const List = await this.Api.groupGames(Group.GroupId);
					Lists.set(Group.GroupId, List);
					await this.GroupStore.put(Group.GroupId, { List, SavedAt: Date.now() });
				} catch {
					Failed++;
					Lists.set(Group.GroupId, EmptyList);
				}
			}
		};

		const Ugc = UserCatalog ? toUgc(UserCatalog, '') : (Previous?.Ugc ?? toUgc(null, ''));
		const UgcKnown = !!UserCatalog || !!Previous;
		let GroupUgc = Previous?.GroupUgc ?? toUgc(null, '');
		const Details = new Map<number, GameDetail>();
		let LastInput: EstimateInput | null = null;

		const assemble = async (Complete: boolean): Promise<ApiUserStats> => {
			const Listed = Contributing.filter((Group) => Lists.has(Group.GroupId));
			const Listings = Listed.flatMap((Group) => Lists.get(Group.GroupId)!.Games.map((Listing) => ({ Group, Listing })));
			const Known = new Set([...UserGames.Games.map((Game) => Game.UniverseId), ...Listings.map((Entry) => Entry.Listing.UniverseId)]);
			const Extra = Profile.Showcase.filter((Id) => !Known.has(Id));
			const Unfetched = [...Known, ...Extra].filter((Id) => !Details.has(Id));
			if (Unfetched.length > 0) {
				for (const [Id, Detail] of await settle(this.Api.gameDetails(Unfetched), new Map<number, GameDetail>())) {
					Details.set(Id, Detail);
				}
			}

			const OwnGames: GameInfo[] = [
				...UserGames.Games.map((Listing) => toGame(Listing, Details.get(Listing.UniverseId), null)),
				...Listings.filter((Entry) => Entry.Group.Tier === 'Owner').map((Entry) =>
					toGame(Entry.Listing, Details.get(Entry.Listing.UniverseId), Entry.Group.Name)
				),
				...Extra.flatMap((Id) => {
					const Detail = Details.get(Id);
					return Detail ? [toGame(Detail, Detail, Detail.CreatorType === 'Group' ? Detail.CreatorName : null)] : [];
				})
			].sort((A, B) => B.Visits - A.Visits);
			const GroupGames: GroupGameInfo[] = Listings.filter((Entry) => Entry.Group.Tier !== 'Owner')
				.map((Entry) => ({
					...toGame(Entry.Listing, Details.get(Entry.Listing.UniverseId), null),
					GroupId: Entry.Group.GroupId,
					GroupName: Entry.Group.Name,
					RoleName: Entry.Group.RoleName,
					Tier: Entry.Group.Tier
				}))
				.sort((A, B) => B.Visits - A.Visits);

			for (const Group of Contributing) {
				const Games = Listings.filter((Entry) => Entry.Group === Group).map((Entry) =>
					toGame(Entry.Listing, Details.get(Entry.Listing.UniverseId), null)
				);
				Group.GameCount = Games.length;
				Group.GameVisits = sum(Games, (Game) => Game.Visits);
				Group.GamePlaying = sum(Games, (Game) => Game.Playing);
			}

			const OwnTotals = totalsOf(OwnGames, UserGames.Truncated || Listed.some((Group) => Group.Tier === 'Owner' && Lists.get(Group.GroupId)!.Truncated));
			const GroupTotals = totalsOf(GroupGames, Listed.some((Group) => Group.Tier !== 'Owner' && Lists.get(Group.GroupId)!.Truncated));
			const TopOwn = OwnGames.filter(isListable);
			const TopGroup = GroupGames.filter(isListable);
			const Input: EstimateInput = {
				BadgeRemoved,
				LostRoles,
				Followers: Profile.Followers ?? 0,
				Description: Profile.About?.Description ?? '',
				SocialLinks: Profile.About?.SocialLinks ?? [],
				BadgeNames,
				Games: TopOwn,
				GameTotals: OwnTotals,
				Groups,
				GroupGames: TopGroup,
				GroupGameTotals: GroupTotals,
				Ugc,
				GroupUgc
			};
			LastInput = structuredClone(Input);
			return {
				followers: Profile.Followers ?? 0,
				friends: Profile.Friends ?? 0,
				accountCreated: Profile.About?.Created ?? null,
				reason: this.Estimator.estimate(Input, Complete),
				games: {
					count: OwnTotals.Count,
					visits: OwnTotals.Visits,
					playing: OwnTotals.Playing,
					top: TopOwn.slice(0, TopCount).map((Game) => ({
						universeId: Game.UniverseId,
						placeId: Game.PlaceId,
						name: Game.Name,
						visits: Game.Visits,
						playing: Game.Playing,
						viaGroup: Game.ViaGroup
					}))
				},
				groupGames: {
					count: GroupTotals.Count,
					visits: GroupTotals.Visits,
					playing: GroupTotals.Playing,
					top: TopGroup.slice(0, TopCount).map((Game) => ({
						universeId: Game.UniverseId,
						placeId: Game.PlaceId,
						name: Game.Name,
						visits: Game.Visits,
						playing: Game.Playing,
						groupId: Game.GroupId,
						groupName: Game.GroupName,
						role: Game.RoleName,
						tier: Game.Tier
					}))
				},
				ugc: {
					sampledCount: Ugc.SampledCount + GroupUgc.SampledCount,
					sampledFavorites: Ugc.SampledFavorites + GroupUgc.SampledFavorites,
					hasMore: Ugc.HasMore || GroupUgc.HasMore
				}
			};
		};

		const Quick = fetchLists(Missing.slice(0, QuickGroupFetches));
		await Promise.race([Quick, new Promise((Resolve) => setTimeout(Resolve, QuickPassMaxWaitMs))]);
		Progress.Latest = await assemble(false);
		Progress.LatestAt = Date.now();

		await Quick;
		await fetchLists(Missing.slice(QuickGroupFetches));
		const UgcGroups = Groups.filter((Group) => Group.Tier === 'Owner' || (isContributionTier(Group.Tier) && UgcRolePattern.test(Group.RoleName)))
			.sort((A, B) => Number(A.Tier === 'Owner') - Number(B.Tier === 'Owner') || B.MemberCount - A.MemberCount)
			.slice(0, MaxUgcGroups);
		const Catalogs = await this.CatalogStore.getMany(UgcGroups.map((Group) => Group.GroupId));
		const StaleCatalogs = UgcGroups.filter((Group) => Date.now() - (Catalogs.get(Group.GroupId)?.SavedAt ?? 0) > GroupCatalogFreshMs).slice(
			0,
			MaxCatalogFetches
		);
		for (const Group of StaleCatalogs) {
			if (this.Api.isCoolingDown('Catalog')) break;
			const Page = await settle(this.Api.catalog('Group', Group.GroupId), null);
			if (!Page) continue;
			const Saved = { Page, SavedAt: Date.now() };
			Catalogs.set(Group.GroupId, Saved);
			await this.CatalogStore.put(Group.GroupId, Saved);
		}
		const CatalogSources = UgcGroups.flatMap((Group) => {
			const Saved = Catalogs.get(Group.GroupId);
			return Saved ? [{ Page: Saved.Page, Group }] : [];
		});
		if (CatalogSources.length > 0 || UgcGroups.length === 0) GroupUgc = toGroupUgc(CatalogSources);
		const FinalComplete = Failed === 0 && UgcKnown;
		const Final = await assemble(FinalComplete);
		const SavedAt = Date.now();
		const Roles = Groups.filter((Group) => isContributionTier(Group.Tier)).map((Group) => ({
			GroupId: Group.GroupId,
			Name: Group.Name,
			RoleName: Group.RoleName,
			Tier: Group.Tier
		}));
		await this.StatsStore.put(UserId, {
			Stats: Final,
			Input: LastInput ?? undefined,
			Complete: FinalComplete,
			Version: EstimatorVersion,
			Roles,
			Ugc,
			GroupUgc,
			Partial: Failed > 0,
			SavedAt
		});
		Progress.Latest = Final;
		Progress.LatestAt = SavedAt;
		Progress.Complete = true;
	}
}

function lostRoles(Before: StoredRole[], Now: GroupInfo[]): LostRole[] {
	const Current = new Map(Now.map((Group) => [Group.GroupId, Group]));
	return Before.flatMap((Role) => {
		const Still = Current.get(Role.GroupId);
		if (Still && (Still.RoleName === Role.RoleName || tierOrder(Still.Tier) <= tierOrder(Role.Tier))) return [];
		return [{ GroupId: Role.GroupId, Name: Role.Name, RoleName: Role.RoleName, NowRoleName: Still?.RoleName ?? null }];
	});
}

function toGame(Listing: GameListing, Detail: GameDetail | undefined, ViaGroup: string | null): GameInfo {
	return {
		UniverseId: Listing.UniverseId,
		PlaceId: Detail?.PlaceId || Listing.PlaceId,
		Name: Detail?.Name || Listing.Name,
		Visits: Math.max(Detail?.Visits ?? 0, Listing.Visits),
		Playing: Detail?.Playing ?? 0,
		Created: Detail?.Created ?? null,
		ViaGroup
	};
}

function toUgc(Page: CatalogPage | null, FallbackCreator: string): UgcInfo {
	const Items = [...(Page?.Items ?? [])].sort((A, B) => B.Favorites - A.Favorites);
	const Top = Items[0];
	return {
		TopName: Top?.Name ?? null,
		TopFavorites: Top?.Favorites ?? 0,
		TopUrl: Top ? itemUrl(Top) : null,
		CreatorName: Top?.CreatorName || FallbackCreator,
		SampledCount: Items.length,
		SampledFavorites: sum(Items, (Item) => Item.Favorites),
		HasMore: Page?.HasMore ?? false
	};
}

function toGroupUgc(Sources: Array<{ Page: CatalogPage; Group: GroupInfo }>): UgcInfo {
	const Entries = Sources.flatMap((Source) => Source.Page.Items.map((Item) => ({ Item, Group: Source.Group }))).sort(
		(A, B) => B.Item.Favorites - A.Item.Favorites
	);
	const Top = Entries[0];
	return {
		TopName: Top?.Item.Name ?? null,
		TopFavorites: Top?.Item.Favorites ?? 0,
		TopUrl: Top ? itemUrl(Top.Item) : null,
		CreatorName: Top ? Top.Item.CreatorName || Top.Group.Name : '',
		CreatorRole: Top && Top.Group.Tier !== 'Owner' ? Top.Group.RoleName : null,
		SourceCount: Sources.filter((Source) => Source.Page.Items.length > 0).length,
		SampledCount: Entries.length,
		SampledFavorites: sum(Entries, (Entry) => Entry.Item.Favorites),
		HasMore: Sources.some((Source) => Source.Page.HasMore)
	};
}

function itemUrl(Item: CatalogItem): string {
	return Item.ItemType === 'Bundle' ? `https://www.roblox.com/bundles/${Item.Id}` : `https://www.roblox.com/catalog/${Item.Id}`;
}

function totalsOf(Games: GameInfo[], Truncated: boolean): Totals {
	return {
		Count: Games.length,
		Visits: sum(Games, (Game) => Game.Visits),
		Playing: sum(Games, (Game) => Game.Playing),
		Truncated
	};
}

function isListable(Game: GameInfo): boolean {
	return Game.UniverseId > 0 && !UnlistableNamePattern.test(Game.Name.trim());
}

function sum<T>(Items: T[], pick: (Item: T) => number): number {
	return Items.reduce((Total, Item) => Total + pick(Item), 0);
}
