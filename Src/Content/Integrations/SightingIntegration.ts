import { sendMessage } from '../../Shared/Messages';
import { Settings } from '../../Shared/Settings';
import { RobloxPage, RobloxSelectors } from '../Roblox/RobloxDom';
import { isOwnNode } from '../Ui/Element';
import type { Integration } from './Integration';

const MaxClimb = 6;

export class SightingIntegration implements Integration {
	private readonly Seen = new Set<number>();

	async update(): Promise<void> {
		if (!Settings.current().ReportSightings) return;
		const Fresh = this.collectSightings().filter((UserId) => !this.Seen.has(UserId));
		if (Fresh.length === 0) return;
		for (const UserId of Fresh) this.Seen.add(UserId);

		const { Users } = await sendMessage('LookupUsers', { UserIds: Fresh });
		const Untracked = Fresh.filter((UserId) => !Users[UserId]);
		if (Untracked.length > 0) await sendMessage('ReportSightings', { UserIds: Untracked });
	}

	private collectSightings(): number[] {
		const UserIds = new Set<number>();
		const ProfileUserId = RobloxPage.profileUserId();
		for (const Icon of document.querySelectorAll(RobloxSelectors.VerifiedIcon)) {
			if (isOwnNode(Icon)) continue;
			const UserId = this.ownerOf(Icon) ?? (ProfileUserId !== null && !Icon.closest('a') ? ProfileUserId : null);
			if (UserId !== null) UserIds.add(UserId);
		}
		return [...UserIds];
	}

	private ownerOf(Icon: Element): number | null {
		let Ancestor: Element | null = Icon;
		for (let Depth = 0; Ancestor && Depth < MaxClimb; Depth++, Ancestor = Ancestor.parentElement) {
			const Ids = new Set<number>();
			for (const Link of Ancestor.querySelectorAll(RobloxSelectors.UserLink)) {
				const UserId = RobloxPage.userIdFromHref(Link.getAttribute('href'));
				if (UserId !== null) Ids.add(UserId);
			}
			if (Ids.size === 1) return [...Ids][0];
			if (Ids.size > 1) return null;
		}
		return null;
	}
}
