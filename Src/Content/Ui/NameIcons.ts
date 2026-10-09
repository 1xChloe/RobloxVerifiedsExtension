import type { ApiUserDetail } from '../../Shared/ApiTypes';
import { Icons, type IconShape } from './Icons';
import { boughtFlag } from './UserStatus';

export type IconTone = 'default' | 'warning' | 'danger';

export interface NameIcon {
	Key: string;
	Label: string;
	Detail: string;
	Tone: IconTone;
	Shape: IconShape;
}

const OwnedGroupEvidence = 'a group they own';
const VideoStarSummary = 'Roblox Video Star';

export function nameIcons(User: ApiUserDetail): NameIcon[] {
	const Result: NameIcon[] = [];
	const Bought = boughtFlag(User);
	if (Bought) {
		Result.push({
			Key: 'bought',
			Label: 'Bought (flagged)',
			Detail: 'Flagged for paying for the verified badge',
			Tone: 'danger',
			Shape: Icons.Warning
		});
	} else if (User.flagged) {
		Result.push({
			Key: 'flagged',
			Label: User.flags[0] ? `Flagged: ${User.flags[0].reason}` : 'Flagged',
			Detail: 'RobloxVerifieds flag',
			Tone: 'danger',
			Shape: Icons.Flag
		});
	} else if (User.flaggedViaAlt) {
		Result.push({
			Key: 'flagged-alt',
			Label: 'Linked to a flagged account',
			Detail: User.flaggedAlt ? `@${User.flaggedAlt.username}` : 'RobloxVerifieds flag',
			Tone: 'danger',
			Shape: Icons.Flag
		});
	}
	if (User.status === 'banned') {
		Result.push({ Key: 'banned', Label: 'Banned', Detail: 'Roblox terminated this account', Tone: 'warning', Shape: Icons.Banned });
	} else if (!User.isVerified) {
		Result.push({ Key: 'ex', Label: 'Ex-verified', Detail: 'Roblox removed their verified badge', Tone: 'default', Shape: Icons.ExVerified });
	}
	const Reason = Bought ? null : reasonIcon(User);
	if (Reason) Result.push(Reason);
	return Result;
}

function reasonIcon(User: ApiUserDetail): NameIcon | null {
	const Reason = User.reason;
	if (!Reason) return null;
	const Estimate = `Estimated reason, ${Reason.confidence} confidence`;
	const make = (Label: string, Shape: IconShape, Tone: IconTone = 'default', Detail = Estimate): NameIcon => ({
		Key: `reason:${Reason.kind}:${Label}`,
		Label,
		Detail,
		Tone,
		Shape
	});
	switch (Reason.kind) {
		case 'RobloxStaff':
			return make('Roblox staff', Icons.Shield, 'default', 'Holds the Roblox Administrator badge');
		case 'GameDeveloper':
			return ownsGameGroup(User) ? make('Group game owner', Icons.Group) : make('Game developer', Icons.Controller);
		case 'GroupGameContributor':
			return make('Group game contributor', Icons.Hammer);
		case 'UgcCreator':
		case 'GroupUgcCreator':
			return make(Reason.label, Icons.Shirt);
		case 'Influencer':
			return Reason.summary.startsWith(VideoStarSummary) ? make(VideoStarSummary, Icons.Camera) : make(Reason.label, Icons.Star);
		case 'NoLongerQualifies':
			return make('Former qualification', Icons.History);
		case 'PossiblyBought':
			return make('Possibly bought', Icons.Warning, 'warning');
		default:
			return null;
	}
}

function ownsGameGroup(User: ApiUserDetail): boolean {
	const Primary = User.stats?.reason.primary;
	return !!Primary && Primary.kind === 'GameDeveloper' && Primary.evidence.some((Line) => Line.includes(OwnedGroupEvidence));
}
