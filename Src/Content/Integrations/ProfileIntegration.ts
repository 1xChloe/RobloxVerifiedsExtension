import type { ApiUserDetail } from '../../Shared/ApiTypes';
import { sendMessage, type MessageResponse } from '../../Shared/Messages';
import { Settings } from '../../Shared/Settings';
import { RobloxClasses, RobloxPage } from '../Roblox/RobloxDom';
import { OwnRootAttribute, createElement, joinClasses } from '../Ui/Element';
import type { HoverCard } from '../Ui/HoverCard';
import { EnterClass } from '../Ui/Slot';
import { iconSvg } from '../Ui/Icons';
import { nameIcons, type NameIcon } from '../Ui/NameIcons';
import { Tooltip } from '../Ui/Tooltip';
import { buildUserSummary } from '../Ui/UserSummary';
import { StatusLabels, accountVariant, boughtFlag, isFlagged, reasonLabel, reasonTone, statusVariant } from '../Ui/UserStatus';
import { AboutSection } from './AboutSection';
import type { Integration } from './Integration';
import { VerificationPanel } from './VerificationPanel';

const PendingPollMs = [1_000, 1_500, 2_000, 3_000];
const SteadyPollMs = 4_000;
const MaxPendingPolls = 20;
const StatsFreshMs = 24 * 60 * 60 * 1000;
const SubmitProblems = {
	not_verified: 'Roblox doesn’t show a verified badge on this account.',
	not_found: 'Roblox couldn’t find this account.',
	opted_out: 'this account opted out of tracking.'
};

export class ProfileIntegration implements Integration {
	private readonly Section = new AboutSection();
	private readonly Panel = new VerificationPanel(this.Section.Container);
	private readonly Pill: HTMLButtonElement;
	private readonly IconRow: HTMLSpanElement;
	private readonly Tips = new Tooltip();
	private IconKey = '';
	private IconMode: boolean | null = null;
	private UserId: number | null = null;
	private User: ApiUserDetail | null = null;
	private PendingRetries = 0;
	private HasFresh = false;
	private ReasonPending = false;
	private Untracked = false;
	private UntrackedBadge: boolean | null = null;
	private AutoSubmitted = false;
	private RetryTimer: number | undefined;

	constructor(private readonly Cards: HoverCard) {
		this.Pill = createElement('button', {
			Class: joinClasses('rvf-profile-pill', RobloxClasses.LabelSmall),
			Attributes: { type: 'button', [OwnRootAttribute]: '' },
			On: { click: () => this.jumpToDetails() }
		});
		this.Cards.attach(this.Pill, () => (this.User ? buildUserSummary(this.User) : []));
		this.IconRow = createElement('span', { Class: 'rvf-name-icons', Attributes: { [OwnRootAttribute]: '' } });
	}

	update(): void {
		const UserId = RobloxPage.profileUserId();
		if (UserId === null || !Settings.current().ShowProfileSection) {
			this.reset();
			return;
		}
		if (UserId !== this.UserId) this.switchTo(UserId);
		if (this.Untracked) {
			this.syncUntracked(UserId);
			if (!this.UntrackedBadge) {
				this.Section.detach();
				return;
			}
		}
		this.Section.attach();
		if (this.User && this.IconMode !== Settings.current().ShowNameIcons) this.renderPill();
		this.attachBadge();
	}

	private jumpToDetails(): void {
		this.Panel.openDetails();
		this.Section.reveal();
	}

	private switchTo(UserId: number): void {
		this.reset();
		this.UserId = UserId;
		this.Panel.showSkeleton();
		void this.showCached(UserId);
		void this.fetchUser(UserId);
	}

	private async showCached(UserId: number): Promise<void> {
		try {
			const { User } = await sendMessage('GetCachedUser', { UserId });
			if (!User || UserId !== this.UserId || this.HasFresh) return;
			this.User = User;
			this.Panel.showUser(User, { PollingStopped: false });
			this.renderPill();
		} catch {
			return;
		}
	}

	private async fetchUser(UserId: number): Promise<void> {
		try {
			const { User } = await sendMessage('GetUser', { UserId });
			if (UserId !== this.UserId) return;
			this.HasFresh = true;
			const GatherLocally = !!User && needsLocalStats(User);
			this.User = User && GatherLocally ? { ...User, statsPending: true } : User;
			this.Untracked = !User;
			this.UntrackedBadge = null;
			if (this.User) this.Panel.showUser(this.User, { PollingStopped: false });
			else this.update();
			this.renderPill();
			if (GatherLocally) void this.loadLocalStats(UserId);
		} catch (Err) {
			if (UserId !== this.UserId) return;
			this.Panel.showError((Err as Error).message, () => {
				this.Panel.showSkeleton();
				void this.fetchUser(UserId);
			});
		}
	}

	private async loadLocalStats(UserId: number): Promise<void> {
		if (!this.User) return;
		try {
			const Local = await sendMessage('GetLocalStats', { UserId, BadgeRemoved: !this.User.isVerified });
			if (UserId !== this.UserId || !this.User) return;
			const KeepPolling = Local.Pending && this.PendingRetries < MaxPendingPolls;
			this.ReasonPending = Local.Partial && KeepPolling;
			this.User = withLocalStats(this.User, Local, KeepPolling);
			this.Panel.showUser(this.User, { PollingStopped: Local.Pending && !KeepPolling, ReasonPending: this.ReasonPending });
			this.renderPill();
			if (KeepPolling) {
				const Delay = PendingPollMs[this.PendingRetries] ?? SteadyPollMs;
				this.PendingRetries++;
				this.RetryTimer = window.setTimeout(() => void this.loadLocalStats(UserId), Delay);
			}
		} catch {
			if (UserId !== this.UserId || !this.User) return;
			this.User = { ...this.User, statsPending: false };
			this.Panel.showUser(this.User, { PollingStopped: false });
		}
	}

	private syncUntracked(UserId: number): void {
		const HasBadge = RobloxPage.profileShowsVerifiedBadge();
		if (HasBadge === this.UntrackedBadge) return;
		this.UntrackedBadge = HasBadge;
		if (!HasBadge) return;
		if (!Settings.current().ReportSightings) {
			this.Panel.showUntracked({ onSubmit: () => this.submit(UserId) });
			return;
		}
		if (this.AutoSubmitted) return;
		this.AutoSubmitted = true;
		this.Panel.showSubmitting();
		this.submit(UserId).catch((Err: unknown) => {
			if (UserId !== this.UserId) return;
			this.Panel.showNote(`Couldn't add this account: ${(Err as Error).message}`);
		});
	}

	private async submit(UserId: number): Promise<void> {
		const { Status } = await sendMessage('SubmitUser', { UserId });
		if (Status !== 'added' && Status !== 'already_tracked') throw new Error(SubmitProblems[Status]);
		if (UserId === this.UserId) await this.fetchUser(UserId);
	}

	private attachBadge(): void {
		const Name = RobloxPage.profileNameElement();
		if (!Name?.parentElement || !this.User) return;
		const Badge = this.IconMode ? this.IconRow : this.Pill;
		if (Badge.parentElement !== Name.parentElement) Name.parentElement.append(Badge);
	}

	private renderPill(): void {
		this.IconMode = Settings.current().ShowNameIcons;
		if (!this.User) {
			this.Pill.remove();
			this.IconRow.remove();
			this.IconKey = '';
			return;
		}
		if (this.IconMode) {
			this.Pill.remove();
			this.renderIcons(this.User);
		} else {
			this.IconRow.remove();
			this.IconKey = '';
			this.renderTextPill(this.User);
		}
		this.attachBadge();
	}

	private renderTextPill(User: ApiUserDetail): void {
		const Variant = statusVariant(User);
		const Account = StatusLabels[accountVariant(User)];
		const Detail = isFlagged(User) && !boughtFlag(User) ? 'Flagged' : reasonLabel(User);
		const Label = Detail ? `${Account} · ${Detail}` : Account;
		const Tone = reasonTone(User);
		const IsNew = !this.Pill.isConnected;
		this.Pill.className = joinClasses(
			'rvf-profile-pill',
			`rvf-profile-pill--${Variant}`,
			Tone && Variant !== 'flagged' && `rvf-profile-pill--${Tone}`,
			RobloxClasses.LabelSmall,
			IsNew && EnterClass
		);
		this.Pill.textContent = Label;
		this.Pill.setAttribute('aria-label', `RobloxVerifieds: ${Label}. Jump to details.`);
	}

	private renderIcons(User: ApiUserDetail): void {
		const List = nameIcons(User);
		const Key = List.map((Icon) => `${Icon.Key}|${Icon.Detail}`).join(',');
		if (Key === this.IconKey) return;
		const Shown = new Set(this.IconKey.split(',').map((Entry) => Entry.split('|')[0]));
		this.IconKey = Key;
		this.Tips.hide();
		this.IconRow.replaceChildren(...List.map((Icon) => this.iconButton(Icon, !Shown.has(Icon.Key))));
	}

	private iconButton(Icon: NameIcon, IsNew: boolean): HTMLButtonElement {
		const Button = createElement(
			'button',
			{
				Class: joinClasses('rvf-name-icon', `rvf-name-icon--${Icon.Tone}`, IsNew && EnterClass),
				Attributes: { type: 'button', 'aria-label': `RobloxVerifieds: ${Icon.Label}. ${Icon.Detail}.` },
				On: { click: () => this.jumpToDetails() }
			},
			[iconSvg(Icon.Shape)]
		);
		this.Tips.attach(Button, () => [
			createElement('div', { Class: 'rvf-tooltip__label', Text: Icon.Label }),
			createElement('div', { Class: 'rvf-tooltip__detail', Text: Icon.Detail })
		]);
		return Button;
	}

	private reset(): void {
		window.clearTimeout(this.RetryTimer);
		this.Section.detach();
		this.Pill.remove();
		this.IconRow.remove();
		this.IconKey = '';
		this.Tips.hide();
		this.UserId = null;
		this.User = null;
		this.PendingRetries = 0;
		this.HasFresh = false;
		this.ReasonPending = false;
		this.Untracked = false;
		this.UntrackedBadge = null;
		this.AutoSubmitted = false;
	}
}

function needsLocalStats(User: ApiUserDetail): boolean {
	if (User.isBanned) return false;
	return !User.stats || !User.statsUpdatedAt || Date.now() - User.statsUpdatedAt > StatsFreshMs;
}

function withLocalStats(User: ApiUserDetail, Local: MessageResponse<'GetLocalStats'>, Pending: boolean): ApiUserDetail {
	const Primary = Local.Partial ? null : Local.Stats?.reason.primary;
	const Confidence = Local.Partial ? null : Local.Stats?.reason.confidence;
	return {
		...User,
		stats: Local.Stats ?? User.stats,
		statsUpdatedAt: Local.Stats ? Local.UpdatedAt : User.statsUpdatedAt,
		statsPending: Pending,
		reason:
			Primary && Confidence
				? { kind: Primary.kind, label: Primary.label, confidence: Confidence, summary: Primary.summary }
				: User.reason
	};
}
