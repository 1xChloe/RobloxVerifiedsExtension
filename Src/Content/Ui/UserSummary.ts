import type { ApiUser } from '../../Shared/ApiTypes';
import { RobloxClasses } from '../Roblox/RobloxDom';
import { createElement, externalLink } from './Element';
import { describeStatus, statusVariant } from './UserStatus';

export function buildUserSummary(User: ApiUser): Node[] {
	const Variant = statusVariant(User);
	const Nodes: Node[] = [
		createElement('div', { Class: `${RobloxClasses.LabelMedium} ${RobloxClasses.TextEmphasis}`, Text: User.displayName }),
		createElement('div', { Class: `${RobloxClasses.BodySmall} ${RobloxClasses.TextMuted}`, Text: `@${User.username}` }),
		createElement('div', {
			Class: `rvf-status rvf-status--${Variant} ${RobloxClasses.LabelSmall}`,
			Text: describeStatus(User)
		})
	];
	if (User.reason) {
		Nodes.push(
			createElement('div', { Class: `${RobloxClasses.BodySmall} ${RobloxClasses.TextDefault}` }, [
				createElement('span', { Class: RobloxClasses.TextAccent, Text: `${User.reason.label}: ` }),
				User.reason.summary
			])
		);
	}
	Nodes.push(externalLink('Open on RobloxVerifieds', User.profileUrl, `rvf-link ${RobloxClasses.LabelSmall}`));
	return Nodes;
}
