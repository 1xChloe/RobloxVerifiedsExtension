import type { ApiUser, ApiUserDetail } from '../../Shared/ApiTypes';

export type StatusVariant = 'verified' | 'previously-verified' | 'banned' | 'flagged';

export const StatusLabels: Record<StatusVariant, string> = {
	verified: 'Verified',
	'previously-verified': 'Previously verified',
	banned: 'Banned',
	flagged: 'Flagged'
};

const ShortLabels: Record<StatusVariant, string> = {
	verified: 'Verified',
	'previously-verified': 'Ex-verified',
	banned: 'Banned',
	flagged: 'Flagged'
};

export type AccountVariant = Exclude<StatusVariant, 'flagged'>;

export function isFlagged(User: ApiUser): boolean {
	return User.flagged || User.flaggedViaAlt;
}

export function accountVariant(User: ApiUser): AccountVariant {
	if (User.status === 'banned') return 'banned';
	return User.status === 'verified' ? 'verified' : 'previously-verified';
}

export function statusVariant(User: ApiUser): StatusVariant {
	return isFlagged(User) ? 'flagged' : accountVariant(User);
}

export function describeStatus(User: ApiUser): string {
	const Account = StatusLabels[accountVariant(User)];
	if (!isFlagged(User)) return Account;
	return `${Account} · ${User.flagged ? 'Flagged' : 'Linked to a flagged account'}`;
}

export type ReasonTone = 'warning' | 'danger';

const BoughtFlagPattern = /paid for verification|(bought|purchased) (a |the |their )?(verif|badge|check)/i;

export function boughtFlag(User: ApiUserDetail): ApiUserDetail['flags'][number] | null {
	return User.flags.find((Flag) => BoughtFlagPattern.test(Flag.reason)) ?? null;
}

export function reasonTone(User: ApiUserDetail): ReasonTone | null {
	if (boughtFlag(User)) return 'danger';
	return User.reason?.kind === 'PossiblyBought' ? 'warning' : null;
}

export function reasonLabel(User: ApiUserDetail): string | null {
	if (boughtFlag(User)) return 'Bought (flagged)';
	return User.reason?.label ?? null;
}

export function shortStatusLabel(Variant: StatusVariant): string {
	return ShortLabels[Variant];
}
