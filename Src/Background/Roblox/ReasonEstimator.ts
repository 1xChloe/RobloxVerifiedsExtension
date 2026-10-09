import type { ApiUserStats, ReasonCandidate, ReasonConfidence, RoleTier } from '../../Shared/ApiTypes';
import { formatCompact } from '../../Shared/Format';
import type { SocialLink } from './RobloxApi';

type Anchors = ReadonlyArray<readonly [Value: number, Score: number]>;

export const EstimatorVersion = 7;

export interface GroupInfo {
	GroupId: number;
	Name: string;
	MemberCount: number;
	HasVerifiedBadge: boolean;
	RoleName: string;
	RoleRank: number;
	Tier: RoleTier;
	GameCount: number;
	GameVisits: number;
	GamePlaying: number;
}

export interface GameInfo {
	UniverseId: number;
	PlaceId: number;
	Name: string;
	Visits: number;
	Playing: number;
	Created?: string | null;
	ViaGroup: string | null;
}

export interface GroupGameInfo extends GameInfo {
	GroupId: number;
	GroupName: string;
	RoleName: string;
	Tier: RoleTier;
}

export interface Totals {
	Count: number;
	Visits: number;
	Playing: number;
	Truncated: boolean;
}

export interface UgcInfo {
	TopName: string | null;
	TopFavorites: number;
	TopUrl: string | null;
	CreatorName: string;
	SampledCount: number;
	SampledFavorites: number;
	HasMore: boolean;
}

export interface LostRole {
	GroupId: number;
	Name: string;
	RoleName: string;
	NowRoleName: string | null;
}

export interface EstimateInput {
	BadgeRemoved: boolean;
	LostRoles: LostRole[];
	Followers: number;
	Description: string;
	SocialLinks: SocialLink[];
	BadgeNames: string[];
	Games: GameInfo[];
	GameTotals: Totals;
	Groups: GroupInfo[];
	GroupGames: GroupGameInfo[];
	GroupGameTotals: Totals;
	Ugc: UgcInfo;
	GroupUgc: UgcInfo;
}

const EngagementAnchors: Anchors = [
	[1e4, 5],
	[1e5, 25],
	[5e5, 50],
	[1e6, 75],
	[3e6, 88],
	[1e7, 95]
];
const FavoriteAnchors: Anchors = [
	[1e2, 10],
	[1e3, 30],
	[1e4, 50],
	[1e5, 70],
	[1e6, 88],
	[1e7, 95]
];
const FollowerAnchors: Anchors = [
	[1e3, 10],
	[1e4, 30],
	[1e5, 60],
	[1e6, 88],
	[1e7, 96]
];

const TierWeight: Record<RoleTier, number> = {
	Owner: 1,
	CoOwner: 0.85,
	Developer: 0.7,
	Staff: 0.5,
	Influencer: 0,
	Member: 0
};

const TierOrder: RoleTier[] = ['Owner', 'CoOwner', 'Developer', 'Staff', 'Influencer', 'Member'];
const MinPrimaryScore = 25;
const MinListedScore = 15;
const EligibleHours = 1_000_000;
const HoursPerConcurrentPlayer = 24 * 90;
const SessionHours = 0.2;
const PeakWindowShare = 0.4;
const PeakWindowDays = 90;
const DayMs = 24 * 60 * 60 * 1000;
const BreadthHoursShare = 0.25;
const BreadthBonusPerGroup = 4;
const MaxBreadthBonus = 12;
const FootprintVisitCeiling = 50_000;
const FootprintFollowerCeiling = 5_000;
const FootprintFavoriteCeiling = 500;
const FootprintInfluencerGroupFloor = 10_000;
const RobloxVideoStarsGroupId = 4199740;
const VideoStarScore = 95;
const NotableWithoutVideoStarFactor = 0.8;
const RemovedCreatorFactor = 0.4;
const LostRoleScore = 65;
const NoLongerQualifiesScore = 30;
const LinkedSocialBonus = 5;
const MaxLinkedSocialBonus = 10;
const StaffRankFloor = 200;
const MemberRankCeiling = 4;
const CoOwnerRankFloor = 200;
const AdministratorBadgeName = 'administrator';
const SocialLinkPattern = /(youtube\.com|youtu\.be|tiktok\.com|twitch\.tv|instagram\.com|twitter\.com|x\.com\/)/i;
const CoOwnerPattern = /\b(co[\s-]?owners?|co[\s-]?founders?|founders?|owners?|holders?|investors?|shareholders?)\b/i;
const InfluencerPattern = /\b(influencers?|youtubers?|content creators?|streamers?|video stars?|tiktokers?|ambassadors?|partners?)\b/i;
const DeveloperPattern = new RegExp(
	`\\b(?:${[
		'devs?',
		'develop\\w*',
		'script\\w*',
		'program\\w*',
		'coders?',
		'coding',
		'build(?:er|ers|ing)?',
		'modell?(?:er|ers|ing)',
		'design\\w*',
		'art',
		'artists?',
		'animat\\w*',
		'illustrat\\w*',
		'textur\\w*',
		'rig(?:ger|gers|ging)',
		'compos(?:er|ers)',
		'musicians?',
		'music',
		'sound',
		'audio',
		'[vsg]fx',
		'graphics?',
		'ui',
		'ux',
		'engineer\\w*',
		'mappers?',
		'map ?makers?',
		'ugc',
		'contrib\\w*',
		'freelanc\\w*'
	].join('|')})\\b`,
	'i'
);
const StaffPattern =
	/\b(admins?|administrators?|staff|managers?|moderators?|mods?|leads?|head|directors?|executives?|president|chief|officers?|ceo|cto|coo)\b/i;

const PlatformNames: Record<string, string> = {
	youtube: 'YouTube',
	x: 'X',
	twitter: 'X',
	twitch: 'Twitch',
	facebook: 'Facebook',
	discord: 'Discord',
	guilded: 'Guilded',
	tiktok: 'TikTok',
	instagram: 'Instagram'
};

export function classifyRoleTier(Rank: number, RoleName: string, IsOwner: boolean): RoleTier {
	if (IsOwner || Rank === 255) return 'Owner';
	if (Rank <= MemberRankCeiling) return 'Member';
	if (CoOwnerPattern.test(RoleName) && Rank >= CoOwnerRankFloor) return 'CoOwner';
	if (InfluencerPattern.test(RoleName)) return 'Influencer';
	if (DeveloperPattern.test(RoleName)) return 'Developer';
	if (StaffPattern.test(RoleName) || Rank >= StaffRankFloor) return 'Staff';
	return 'Member';
}

export function isContributionTier(Tier: RoleTier): boolean {
	return TierWeight[Tier] > 0;
}

export function tierOrder(Tier: RoleTier): number {
	return TierOrder.indexOf(Tier);
}

export class ReasonEstimator {
	estimate(Raw: EstimateInput, Complete: boolean): ApiUserStats['reason'] {
		const Input = withCurrentTiers(Raw);
		const Candidates = [
			this.robloxStaff(Input),
			this.gameDeveloper(Input),
			this.groupContributor(Input),
			this.ugc(Input.Ugc, 'UgcCreator'),
			this.ugc(Input.GroupUgc, 'GroupUgcCreator'),
			this.influencer(Input),
			Input.BadgeRemoved && !hasNoFootprint(Input) ? this.noLongerQualifies(Input.LostRoles) : null
		]
			.filter((Candidate): Candidate is ReasonCandidate => Candidate !== null && Candidate.score >= MinListedScore)
			.sort((A, B) => B.score - A.score);
		const Strongest = Candidates[0] && Candidates[0].score >= MinPrimaryScore ? Candidates[0] : null;
		const Primary = Strongest ?? (Complete && hasNoFootprint(Input) ? this.possiblyBought(Input) : null);
		return {
			primary: Primary,
			confidence: Primary ? confidenceFor(Primary.score) : null,
			others: Strongest ? Candidates.slice(1) : Candidates
		};
	}

	private robloxStaff(Input: EstimateInput): ReasonCandidate | null {
		if (!Input.BadgeNames.some((Name) => Name.toLowerCase() === AdministratorBadgeName)) return null;
		return {
			kind: 'RobloxStaff',
			label: 'Roblox staff',
			score: 100,
			summary: 'Holds the Roblox Administrator badge',
			evidence: ['Roblox awards the Administrator badge only to its own employees'],
			link: null
		};
	}

	private gameDeveloper(Input: EstimateInput): ReasonCandidate | null {
		const Best = bestByHours(Input.Games);
		const Own = Input.GameTotals;
		if (!Best || Own.Visits <= 0) return null;
		const Top = Best.Game;
		const Evidence = [
			`${countLabel(Own.Count, 'experience', Own.Truncated)} with ${formatCompact(Own.Visits)} total visits`,
			`Top: “${Top.Name}”, ${formatCompact(Top.Visits)} visits${Top.Playing > 0 ? `, ${formatCompact(Top.Playing)} playing` : ''}`,
			hoursEvidence(Best.Hours)
		];
		if (Top.ViaGroup) Evidence.push(`Published through ${Top.ViaGroup}, a group they own`);
		return {
			kind: 'GameDeveloper',
			label: 'Game developer',
			score: clamp(scaleScore(Best.Hours, EngagementAnchors)),
			summary: `Creator of “${Top.Name}” (${formatCompact(Top.Visits)} visits)`,
			evidence: Evidence,
			link: Top.PlaceId > 0 ? { label: Top.Name, url: gameUrl(Top.PlaceId) } : null
		};
	}

	private groupContributor(Input: EstimateInput): ReasonCandidate | null {
		const Contributing = Input.Groups.filter(
			(Group) => Group.Tier !== 'Owner' && isContributionTier(Group.Tier) && Group.GameVisits > 0
		)
			.map((Group) => {
				const Best = bestByHours(Input.GroupGames.filter((Game) => Game.GroupId === Group.GroupId));
				const Hours = Best?.Hours ?? peakHours({ Visits: Group.GameVisits, Playing: Group.GamePlaying });
				return { Group, Top: Best?.Game ?? null, Hours, Weighted: Hours * TierWeight[Group.Tier] };
			})
			.sort((A, B) => B.Weighted - A.Weighted);
		if (Contributing.length === 0) return null;

		const Studios = Contributing.filter((Entry) => Entry.Group.Tier !== 'Staff' && Entry.Hours >= EligibleHours * BreadthHoursShare).length;
		const BreadthBonus = Math.min(MaxBreadthBonus, Math.max(0, Studios - 1) * BreadthBonusPerGroup);
		const TotalVisits = sum(Contributing, (Entry) => Entry.Group.GameVisits);
		const Lead = Contributing[0];
		const Others = Contributing.length - 1;
		const Evidence = Contributing.slice(0, 3).map(
			(Entry) => `“${Entry.Group.RoleName}” in ${Entry.Group.Name}: ${formatCompact(Entry.Group.GameVisits)} visits`
		);
		if (Others > 2) Evidence.push(`${Others - 2} more ${Others - 2 === 1 ? 'group' : 'groups'} with game visits`);
		Evidence.push(hoursEvidence(Lead.Hours, Lead.Top?.Name));
		const Where = Others > 0 ? `${Lead.Group.Name} and ${Others} other ${Others === 1 ? 'group' : 'groups'}` : Lead.Group.Name;
		return {
			kind: 'GroupGameContributor',
			label: 'Group game contributor',
			score: clamp(scaleScore(Lead.Weighted, EngagementAnchors) + BreadthBonus),
			summary: `${Lead.Group.RoleName} at ${Where} (${formatCompact(TotalVisits)} visits)`,
			evidence: Evidence,
			link:
				Lead.Top && Lead.Top.PlaceId > 0
					? { label: Lead.Top.Name, url: gameUrl(Lead.Top.PlaceId) }
					: { label: Lead.Group.Name, url: groupUrl(Lead.Group.GroupId) }
		};
	}

	private ugc(Summary: UgcInfo, Kind: 'UgcCreator' | 'GroupUgcCreator'): ReasonCandidate | null {
		if (!Summary.TopName) return null;
		const Weight = Kind === 'UgcCreator' ? 1 : 0.85;
		const Items = countLabel(Summary.SampledCount, 'catalog item', Summary.HasMore);
		return {
			kind: Kind,
			label: Kind === 'UgcCreator' ? 'UGC creator' : 'Group UGC creator',
			score: clamp((scaleScore(Summary.SampledFavorites, FavoriteAnchors) + (Summary.HasMore ? 5 : 0)) * Weight),
			summary:
				Kind === 'UgcCreator'
					? `${Items}, ${formatCompact(Summary.SampledFavorites)} favorites`
					: `Owns ${Summary.CreatorName}: ${Items}, ${formatCompact(Summary.SampledFavorites)} favorites`,
			evidence: [
				`${Items}${Kind === 'GroupUgcCreator' ? ` from ${Summary.CreatorName}` : ''}`,
				`${formatCompact(Summary.SampledFavorites)} favorites across the top ${Summary.SampledCount}`,
				`Most favorited: “${Summary.TopName}” (${formatCompact(Summary.TopFavorites)})`
			],
			link: Summary.TopUrl ? { label: Summary.TopName, url: Summary.TopUrl } : null
		};
	}

	private influencer(Input: EstimateInput): ReasonCandidate | null {
		const Followers = Input.Followers;
		const Linked = Input.SocialLinks;
		const BioLinks = SocialLinkPattern.test(Input.Description);
		const VideoStar = Input.Groups.find((Group) => Group.GroupId === RobloxVideoStarsGroupId);
		const InfluencerRole = Input.Groups.filter(
			(Group) => Group.Tier === 'Influencer' && Group.GroupId !== RobloxVideoStarsGroupId
		).sort((A, B) => B.MemberCount - A.MemberCount)[0];

		const SocialBonus = Math.min(MaxLinkedSocialBonus, Linked.length * LinkedSocialBonus || (BioLinks ? LinkedSocialBonus : 0));
		let Score = (scaleScore(Followers, FollowerAnchors) + SocialBonus) * NotableWithoutVideoStarFactor;
		if (VideoStar) Score = VideoStarScore;
		const UnlikelyAfterRemoval = Input.BadgeRemoved && !VideoStar;
		if (UnlikelyAfterRemoval) Score *= RemovedCreatorFactor;
		Score = clamp(Score);
		if (Score <= 0) return null;

		const Evidence: string[] = [];
		if (VideoStar) Evidence.push('Member of Roblox Video Stars, Roblox’s own creator program');
		if (Followers > 0) Evidence.push(`${formatCompact(Followers)} followers`);
		if (Linked.length > 0) Evidence.push(`Links ${Linked.map((Link) => platformName(Link.Platform)).join(', ')} on their profile`);
		else if (BioLinks) Evidence.push('Links to video/social platforms in their bio');
		if (InfluencerRole) {
			Evidence.push(`“${InfluencerRole.RoleName}” in ${InfluencerRole.Name} (${formatCompact(InfluencerRole.MemberCount)} members)`);
		}
		if (UnlikelyAfterRemoval) Evidence.push('Roblox rarely removes creator badges, which makes this unlikely here');
		const Featured = VideoStar ?? InfluencerRole;
		return {
			kind: 'Influencer',
			label: 'Content creator / notable',
			score: Score,
			summary: VideoStar
				? `Roblox Video Star with ${formatCompact(Followers)} followers`
				: `${formatCompact(Followers)} followers`,
			evidence: Evidence,
			link: Featured ? { label: Featured.Name, url: groupUrl(Featured.GroupId) } : null
		};
	}

	private noLongerQualifies(LostRoles: LostRole[]): ReasonCandidate {
		const Lost = LostRoles[0];
		const Evidence = LostRoles.slice(0, 3).map((Role) =>
			Role.NowRoleName
				? `Was “${Role.RoleName}” in ${Role.Name} at an earlier check, now “${Role.NowRoleName}”`
				: `Was “${Role.RoleName}” in ${Role.Name} at an earlier check, no longer a member`
		);
		return {
			kind: 'NoLongerQualifies',
			label: 'Former qualification',
			score: Lost ? LostRoleScore : NoLongerQualifiesScore,
			summary: Lost
				? `“${Lost.RoleName}” in ${Lost.Name}, a role they've since lost`
				: 'Likely something they no longer have, such as a group role',
			evidence: Evidence,
			link: Lost ? { label: Lost.Name, url: groupUrl(Lost.GroupId) } : null
		};
	}

	private possiblyBought(Input: EstimateInput): ReasonCandidate {
		const Visits = Input.GameTotals.Visits + Input.GroupGameTotals.Visits;
		const Evidence = [
			`${formatCompact(Visits)} visits across their experiences`,
			`${formatCompact(Input.Followers)} followers`,
			'No development roles or popular UGC found'
		];
		if (Input.BadgeRemoved) Evidence.push('Roblox has since removed the badge');
		return {
			kind: 'PossiblyBought',
			label: 'Possibly bought',
			score: Input.BadgeRemoved ? 60 : 35,
			summary: Input.BadgeRemoved
				? 'No public footprint that explains the badge, and Roblox later removed it'
				: 'No public footprint that explains the badge',
			evidence: Evidence,
			link: null
		};
	}
}

export function withCurrentTiers(Input: EstimateInput): EstimateInput {
	const Groups = Input.Groups.map((Group) => ({
		...Group,
		Tier: classifyRoleTier(Group.RoleRank, Group.RoleName, Group.Tier === 'Owner')
	}));
	const Contributing = Groups.filter((Group) => Group.Tier !== 'Owner' && isContributionTier(Group.Tier));
	const Ids = new Set(Contributing.map((Group) => Group.GroupId));
	const Unchanged = Input.GroupGames.every((Game) => Ids.has(Game.GroupId)) && Groups.every((Group, Index) => Group.Tier === Input.Groups[Index].Tier);
	if (Unchanged) return Input;
	return {
		...Input,
		Groups,
		GroupGames: Input.GroupGames.filter((Game) => Ids.has(Game.GroupId)),
		GroupGameTotals: {
			...Input.GroupGameTotals,
			Count: Contributing.reduce((Total, Group) => Total + Group.GameCount, 0),
			Visits: Contributing.reduce((Total, Group) => Total + Group.GameVisits, 0),
			Playing: Contributing.reduce((Total, Group) => Total + Group.GamePlaying, 0)
		}
	};
}

function hasNoFootprint(Input: EstimateInput): boolean {
	return (
		Input.GameTotals.Visits < FootprintVisitCeiling &&
		Input.GroupGameTotals.Visits < FootprintVisitCeiling &&
		Input.Followers < FootprintFollowerCeiling &&
		Input.Ugc.SampledFavorites + Input.GroupUgc.SampledFavorites < FootprintFavoriteCeiling &&
		!Input.BadgeNames.some((Name) => Name.toLowerCase() === AdministratorBadgeName) &&
		!Input.Groups.some((Group) => Group.Tier === 'Influencer' && Group.MemberCount >= FootprintInfluencerGroupFloor) &&
		!Input.Groups.some((Group) => Group.GroupId === RobloxVideoStarsGroupId)
	);
}

function scaleScore(Value: number, Points: Anchors): number {
	if (Value <= 0) return 0;
	const Log = Math.log10(Value);
	const FirstLog = Math.log10(Points[0][0]);
	if (Log < FirstLog) return Math.max(0, Points[0][1] * (Log - (FirstLog - 1)));
	for (let Index = 1; Index < Points.length; Index++) {
		const LowLog = Math.log10(Points[Index - 1][0]);
		const HighLog = Math.log10(Points[Index][0]);
		if (Log <= HighLog) return Points[Index - 1][1] + ((Log - LowLog) / (HighLog - LowLog)) * (Points[Index][1] - Points[Index - 1][1]);
	}
	return Points[Points.length - 1][1];
}

function peakHours(Game: { Visits: number; Playing: number; Created?: string | null }): number {
	return Math.max(Game.Playing * HoursPerConcurrentPlayer, Game.Visits * SessionHours * peakWindowShare(Game.Created));
}

function peakWindowShare(Created: string | null | undefined): number {
	const CreatedAt = Created ? Date.parse(Created) : NaN;
	if (!Number.isFinite(CreatedAt)) return PeakWindowShare;
	const AgeDays = (Date.now() - CreatedAt) / DayMs;
	if (AgeDays <= PeakWindowDays) return 1;
	return Math.max(PeakWindowShare, Math.sqrt(PeakWindowDays / AgeDays));
}

function bestByHours<T extends { Visits: number; Playing: number; Created?: string | null }>(Games: T[]): { Game: T; Hours: number } | null {
	let Best: { Game: T; Hours: number } | null = null;
	for (const Game of Games) {
		const Hours = peakHours(Game);
		if (!Best || Hours > Best.Hours) Best = { Game, Hours };
	}
	return Best;
}

function hoursEvidence(Hours: number, GameName?: string): string {
	const Share = Math.round((Hours / EligibleHours) * 100);
	const Subject = GameName ? `“${GameName}”` : 'Its best game';
	return `${Subject}: about ${formatCompact(Math.round(Hours))} play hours in its best 90 days, est. (${Share}% of Roblox’s 1M-hour bar)`;
}

function platformName(Platform: string): string {
	return PlatformNames[Platform.toLowerCase()] ?? Platform;
}

function sum<T>(Items: T[], pick: (Item: T) => number): number {
	return Items.reduce((Total, Item) => Total + pick(Item), 0);
}

function clamp(Score: number): number {
	return Math.round(Math.max(0, Math.min(100, Score)));
}

function confidenceFor(Score: number): ReasonConfidence {
	if (Score >= 75) return 'high';
	if (Score >= 50) return 'medium';
	return 'low';
}

function countLabel(Count: number, Noun: string, More: boolean): string {
	return `${Count}${More ? '+' : ''} ${Noun}${Count === 1 && !More ? '' : 's'}`;
}

function gameUrl(PlaceId: number): string {
	return `https://www.roblox.com/games/${PlaceId}`;
}

function groupUrl(GroupId: number): string {
	return `https://www.roblox.com/communities/${GroupId}`;
}
