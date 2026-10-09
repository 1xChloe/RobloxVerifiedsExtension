export type UserStatus = 'verified' | 'previously_verified' | 'banned';
export type ReasonConfidence = 'high' | 'medium' | 'low';
export type RoleTier = 'Owner' | 'CoOwner' | 'Developer' | 'Staff' | 'Influencer' | 'Member';

export interface ReasonSummary {
	kind: string;
	label: string;
	confidence: ReasonConfidence;
	summary: string;
}

export interface ApiUser {
	userId: number;
	username: string;
	displayName: string;
	status: UserStatus;
	isVerified: boolean;
	isBanned: boolean;
	flagged: boolean;
	flaggedViaAlt: boolean;
	trackedSince: number;
	lastCheckedAt: number;
	lastChangedAt: number;
	profileUrl: string;
	reason: ReasonSummary | null;
}

export interface ReasonCandidate {
	kind: string;
	label: string;
	score: number;
	summary: string;
	evidence: string[];
	link: { label: string; url: string } | null;
}

export interface TopGame {
	universeId: number;
	placeId: number;
	name: string;
	visits: number;
	playing: number;
}

export interface OwnGame extends TopGame {
	viaGroup: string | null;
}

export interface TopGroupGame extends TopGame {
	groupId: number;
	groupName: string;
	role: string;
	tier: RoleTier;
}

export interface GameTotals<T extends TopGame> {
	count: number;
	visits: number;
	playing: number;
	top: T[];
}

export interface ApiUserStats {
	followers: number;
	friends: number;
	accountCreated: string | null;
	reason: {
		primary: ReasonCandidate | null;
		confidence: ReasonConfidence | null;
		others: ReasonCandidate[];
	};
	games: GameTotals<OwnGame>;
	groupGames: GameTotals<TopGroupGame>;
	ugc: { sampledCount: number; sampledFavorites: number; hasMore: boolean };
}

export interface ApiUserDetail extends ApiUser {
	flags: Array<{ reason: string; note: string | null; createdAt: number }>;
	flaggedAlt: { userId: number; username: string } | null;
	history: Array<{ isVerified: boolean; observedAt: number }>;
	stats: ApiUserStats | null;
	statsUpdatedAt: number | null;

	statsPending: boolean;
}

export interface ApiLookupResponse {
	users: Record<string, ApiUser>;
	untracked: number[];
	generatedAt: number;
}

export type SubmitStatus = 'added' | 'already_tracked' | 'not_verified' | 'not_found' | 'opted_out';

export interface ApiSubmitResponse {
	status: SubmitStatus;
}

export interface ApiReportResponse {
	accepted: number;
	alreadyTracked: number;
	throttled: boolean;
}
