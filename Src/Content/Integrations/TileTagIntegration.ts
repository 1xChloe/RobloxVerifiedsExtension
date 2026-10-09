import type { ApiUser } from '../../Shared/ApiTypes';
import { sendMessage } from '../../Shared/Messages';
import { Settings } from '../../Shared/Settings';
import { RobloxPage, type TileSpot } from '../Roblox/RobloxDom';
import { OwnRootAttribute, createElement } from '../Ui/Element';
import { describeStatus, shortStatusLabel, statusVariant } from '../Ui/UserStatus';
import type { Integration } from './Integration';

const TileAttribute = 'data-rvf-tile';
const TaggedSuffix = ':tagged';
const ChipClass = 'rvf-tile-tag';
const FailureBackoffMs = 30_000;

interface PendingTile extends TileSpot {
	UserId: number;
}

export class TileTagIntegration implements Integration {
	private RetryAfter = 0;

	async update(): Promise<void> {
		if (!Settings.current().ShowTileTags) {
			this.clear();
			return;
		}
		if (Date.now() < this.RetryAfter) return;
		const Pending = this.collectPending();
		if (Pending.length === 0) return;

		let Users: Record<number, ApiUser | null>;
		try {
			({ Users } = await sendMessage('LookupUsers', { UserIds: [...new Set(Pending.map((Tile) => Tile.UserId))] }));
		} catch (Err) {
			this.RetryAfter = Date.now() + FailureBackoffMs;
			throw Err;
		}
		for (const Tile of Pending) {
			if (!Tile.Root.isConnected) continue;
			const User = Users[Tile.UserId];
			const Tagged = !!User && statusVariant(User) !== 'verified';
			if (Tagged) {
				const Chip = this.chip(User, Tile.Place === 'Below' ? 'rvf-chip--below' : 'rvf-chip--inline');
				if (Tile.Inside) Tile.Anchor.append(Chip);
				else Tile.Anchor.after(Chip);
			}
			Tile.Root.setAttribute(TileAttribute, Tagged ? `${Tile.UserId}${TaggedSuffix}` : String(Tile.UserId));
		}
	}

	private collectPending(): PendingTile[] {
		const Pending: PendingTile[] = [];
		for (const Root of RobloxPage.tileRoots()) {
			const UserId = RobloxPage.tileUserId(Root);
			const Spot = RobloxPage.tileFor(Root);
			if (UserId === null || !Spot || Spot.Root !== Root) continue;
			const Marked = Root.getAttribute(TileAttribute);
			const HasChip = !!Root.querySelector(`.${ChipClass}`);
			if (Marked === String(UserId) && !HasChip) continue;
			if (Marked === `${UserId}${TaggedSuffix}` && HasChip) continue;
			for (const Stale of Root.querySelectorAll(`.${ChipClass}`)) Stale.remove();
			Pending.push({ ...Spot, UserId });
		}
		return Pending;
	}

	private chip(User: ApiUser, Placement: string): HTMLElement {
		const Variant = statusVariant(User);
		return createElement('span', {
			Class: `rvf-chip ${ChipClass} ${Placement} rvf-chip--${Variant}`,
			Text: shortStatusLabel(Variant),
			Attributes: { [OwnRootAttribute]: '', 'aria-label': `RobloxVerifieds: ${describeStatus(User)}` }
		});
	}

	private clear(): void {
		for (const Chip of document.querySelectorAll(`.${ChipClass}`)) Chip.remove();
		for (const Root of document.querySelectorAll(`[${TileAttribute}]`)) Root.removeAttribute(TileAttribute);
	}
}
