import type { ApiUser } from '../../Shared/ApiTypes';
import { sendMessage } from '../../Shared/Messages';
import { Settings } from '../../Shared/Settings';
import { RobloxPage, RobloxSelectors } from '../Roblox/RobloxDom';
import { OwnRootAttribute, createElement, isOwnNode } from '../Ui/Element';
import type { HoverCard } from '../Ui/HoverCard';
import { buildUserSummary } from '../Ui/UserSummary';
import { describeStatus, shortStatusLabel, statusVariant } from '../Ui/UserStatus';
import type { Integration } from './Integration';

const ProcessedAttribute = 'data-rvf-link';
const ChipClass = 'rvf-chip';
const FailureBackoffMs = 30_000;

export class UserLinkIntegration implements Integration {
	private RetryAfter = 0;

	constructor(private readonly Cards: HoverCard) {}

	async update(): Promise<void> {
		if (!Settings.current().ShowLinkBadges) {
			this.clear();
			return;
		}
		if (Date.now() < this.RetryAfter) return;
		const LinksByUser = this.collectNewLinks();
		if (LinksByUser.size === 0) return;

		let Users: Record<number, ApiUser | null>;
		try {
			({ Users } = await sendMessage('LookupUsers', { UserIds: [...LinksByUser.keys()] }));
		} catch (Err) {
			this.RetryAfter = Date.now() + FailureBackoffMs;
			throw Err;
		}
		for (const [UserId, Links] of LinksByUser) {
			const User = Users[UserId];
			for (const Link of Links) {
				Link.setAttribute(ProcessedAttribute, '');
				if (User && Link.isConnected && statusVariant(User) !== 'verified') this.decorate(Link, User);
			}
		}
	}

	private collectNewLinks(): Map<number, HTMLAnchorElement[]> {
		const LinksByUser = new Map<number, HTMLAnchorElement[]>();
		for (const Link of document.querySelectorAll<HTMLAnchorElement>(`${RobloxSelectors.UserLink}:not([${ProcessedAttribute}])`)) {
			if (
				isOwnNode(Link) ||
				Link.closest(RobloxSelectors.NoTagZones) ||
				RobloxPage.tileFor(Link) ||
				!this.hasVisibleText(Link)
			) {
				Link.setAttribute(ProcessedAttribute, '');
				continue;
			}
			const UserId = RobloxPage.userIdFromHref(Link.getAttribute('href'));
			if (UserId === null) {
				Link.setAttribute(ProcessedAttribute, '');
				continue;
			}
			const Existing = LinksByUser.get(UserId);
			if (Existing) Existing.push(Link);
			else LinksByUser.set(UserId, [Link]);
		}
		return LinksByUser;
	}

	private hasVisibleText(Link: HTMLAnchorElement): boolean {
		return (Link.textContent ?? '').trim().length > 0;
	}

	private decorate(Link: HTMLAnchorElement, User: ApiUser): void {
		const Variant = statusVariant(User);
		const Chip = createElement('span', {
			Class: `${ChipClass} ${ChipClass}--${Variant}`,
			Text: shortStatusLabel(Variant),
			Attributes: {
				[OwnRootAttribute]: '',
				tabindex: '0',
				'aria-label': `RobloxVerifieds: ${describeStatus(User)}`
			}
		});
		this.Cards.attach(Chip, () => buildUserSummary(User));
		Link.append(Chip);
	}

	private clear(): void {
		for (const Chip of document.querySelectorAll(`.${ChipClass}`)) Chip.remove();
		for (const Link of document.querySelectorAll(`[${ProcessedAttribute}]`)) Link.removeAttribute(ProcessedAttribute);
	}
}
