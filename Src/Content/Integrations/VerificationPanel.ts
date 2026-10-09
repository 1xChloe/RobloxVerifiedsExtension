import type { ApiUserDetail, ApiUserStats, OwnGame, ReasonCandidate, TopGroupGame } from '../../Shared/ApiTypes';
import { RobloxClasses as Rc, RobloxPage } from '../Roblox/RobloxDom';
import { createElement, externalLink, joinClasses } from '../Ui/Element';
import { formatCompact, formatDate, formatRelative } from '../Ui/Format';
import { countUp, replayEnter } from '../Ui/Motion';
import { skeletonLines, skeletonReason, skeletonTiles } from '../Ui/Skeleton';
import { Slot } from '../Ui/Slot';
import { StatusLabels, accountVariant, boughtFlag, reasonLabel, reasonTone } from '../Ui/UserStatus';

const TopExperienceCount = 5;
const HistoryCount = 5;
const HighlightCount = 4;

const TierLabels: Record<TopGroupGame['tier'], string> = {
	Owner: 'Owner',
	CoOwner: 'Co-owner',
	Developer: 'Developer',
	Staff: 'Staff',
	Influencer: 'Creator',
	Member: 'Member'
};

export interface UserViewOptions {
	PollingStopped: boolean;
	ReasonPending?: boolean;
}

export interface UntrackedOptions {
	onSubmit: () => Promise<void>;
}

type UserFlag = ApiUserDetail['flags'][number];

export class VerificationPanel {
	private Expanded = false;
	private DetailsOpen = false;
	private WhyVerified = true;
	private WhyButton: HTMLButtonElement | null = null;
	private RefreshHandler: (() => void) | null = null;
	private readonly Details: HTMLDivElement;
	private readonly LinkSlot = new Slot();
	private readonly StatusSlot = new Slot();
	private readonly WhySlot = new Slot();
	private readonly ReasonSlot = new Slot();
	private readonly HighlightsSlot = new Slot();
	private readonly MoreSlot = new Slot();
	private readonly ToggleSlot = new Slot();
	private readonly FooterSlot = new Slot();

	constructor(private readonly Container: HTMLElement) {
		this.Details = createElement('div', { Class: 'rvf-details' }, [
			this.ReasonSlot.Root,
			this.HighlightsSlot.Root,
			this.MoreSlot.Root,
			this.ToggleSlot.Root,
			this.FooterSlot.Root
		]);
		this.Details.hidden = !this.DetailsOpen;
		Container.replaceChildren(
			createElement('div', { Class: 'rvf-about__header' }, [
				createElement('h2', { Class: Rc.SectionHeading, Text: 'RobloxVerifieds' }),
				this.LinkSlot.Root
			]),
			createElement('div', { Class: 'rvf-about__body' }, [this.StatusSlot.Root, this.WhySlot.Root, this.Details])
		);
	}

	openDetails(): void {
		if (!this.DetailsOpen) this.setDetailsOpen(true);
	}

	showSkeleton(): void {
		this.clear();
		this.setBusy(true);
		this.StatusSlot.set('skeleton', () => skeletonLines(['short']), false);
		this.ReasonSlot.set('skeleton', () => this.reasonPlaceholder(null), false);
		this.HighlightsSlot.set('skeleton', () => skeletonTiles(HighlightCount), false);
	}

	onRefresh(Handler: () => void): void {
		this.RefreshHandler = Handler;
	}

	showError(Message: string, onRetry: () => void): void {
		this.clear();
		this.setBusy(false);
		this.StatusSlot.set(`error:${Message}`, () =>
			createElement('div', { Class: 'rvf-stack' }, [
				this.note(`Couldn't reach RobloxVerifieds: ${Message}`),
				this.button('Try again', onRetry)
			])
		);
	}

	showUntracked(Options: UntrackedOptions): void {
		this.clear();
		this.setBusy(false);
		this.StatusSlot.set('untracked', () => this.untracked(Options));
	}

	showSubmitting(): void {
		this.clear();
		this.setBusy(true);
		this.StatusSlot.set('submitting', () => this.note('Adding this account to RobloxVerifieds'));
	}

	showNote(Message: string): void {
		this.clear();
		this.setBusy(false);
		this.StatusSlot.set(`note:${Message}`, () => this.note(Message));
	}

	showUser(User: ApiUserDetail, Options: UserViewOptions): void {
		const Stats = User.stats;
		const Gathering = !Stats && User.statsPending && !Options.PollingStopped;
		this.setBusy(Gathering);

		this.LinkSlot.set(User.profileUrl, () =>
			externalLink('Full profile', User.profileUrl, joinClasses('rvf-link', Rc.LabelSmall))
		);
		this.StatusSlot.set(keyOf([User.status, User.trackedSince, User.flags, User.flaggedAlt, User.reason?.label]), () => this.status(User));
		this.WhySlot.set(`why:${User.isVerified}`, () => this.whyToggle(User.isVerified), false);
		this.ReasonSlot.set(
			Stats && !Options.ReasonPending
				? keyOf([Stats.reason, boughtFlag(User)])
				: `pending:${User.statsPending}:${Options.PollingStopped}`,
			() => (Stats && !Options.ReasonPending ? this.reason(User, Stats) : this.reasonPlaceholder(User, Options))
		);
		this.HighlightsSlot.set(Stats ? keyOf(highlightValues(Stats)) : `pending:${Gathering}`, () =>
			Stats ? this.highlights(Stats) : Gathering ? skeletonTiles(HighlightCount) : null
		);
		this.MoreSlot.set(keyOf([Stats?.games.top, Stats?.groupGames.top, User.history]), () => this.more(User));
		this.MoreSlot.Root.hidden = this.MoreSlot.IsEmpty || !this.Expanded;
		this.ToggleSlot.set(this.MoreSlot.IsEmpty ? 'none' : 'toggle', () => (this.MoreSlot.IsEmpty ? null : this.expandToggle()), false);
		this.FooterSlot.set(`${User.statsUpdatedAt}:${User.statsPending}:${User.isBanned}`, () => this.footer(User));
	}

	private clear(): void {
		for (const Region of [
			this.LinkSlot,
			this.StatusSlot,
			this.WhySlot,
			this.ReasonSlot,
			this.HighlightsSlot,
			this.MoreSlot,
			this.ToggleSlot,
			this.FooterSlot
		]) {
			Region.clear();
		}
	}

	private setBusy(Busy: boolean): void {
		this.Container.setAttribute('aria-busy', String(Busy));
	}

	private untracked(Options: UntrackedOptions): HTMLElement {
		const Status = this.note('Not tracked yet.');
		const Submit = this.button('Submit for tracking', async () => {
			Submit.disabled = true;
			Submit.textContent = 'Checking with Roblox';
			try {
				await Options.onSubmit();
			} catch (Err) {
				Status.textContent = `Couldn't submit: ${(Err as Error).message}`;
				Submit.textContent = 'Submit for tracking';
				Submit.disabled = false;
			}
		});
		return createElement('div', { Class: 'rvf-stack' }, [Status, Submit]);
	}

	private whyToggle(IsVerified: boolean): HTMLButtonElement {
		this.WhyVerified = IsVerified;
		this.WhyButton = this.button('', () => this.setDetailsOpen(!this.DetailsOpen), true);
		this.WhyButton.classList.add('rvf-why');
		this.syncWhy();
		return this.WhyButton;
	}

	private setDetailsOpen(Open: boolean): void {
		this.DetailsOpen = Open;
		this.Details.hidden = !Open;
		if (Open) replayEnter(this.Details);
		this.syncWhy();
	}

	private syncWhy(): void {
		if (!this.WhyButton) return;
		const Closed = this.WhyVerified ? 'Why is this user verified?' : 'Why were they verified?';
		this.WhyButton.textContent = this.DetailsOpen ? 'Hide details' : Closed;
		this.WhyButton.setAttribute('aria-expanded', String(this.DetailsOpen));
	}

	private expandToggle(): HTMLButtonElement {
		const Toggle = this.button(
			'',
			() => {
				this.Expanded = !this.Expanded;
				this.MoreSlot.Root.hidden = !this.Expanded;
				if (this.Expanded) replayEnter(this.MoreSlot.Root.firstElementChild);
				syncLabel();
			},
			true
		);
		const syncLabel = () => {
			Toggle.textContent = this.Expanded ? 'Show less' : 'Show more';
			Toggle.setAttribute('aria-expanded', String(this.Expanded));
		};
		syncLabel();
		return Toggle;
	}

	private status(User: ApiUserDetail): HTMLElement {
		const Variant = accountVariant(User);
		const Detail = reasonLabel(User);
		const Label = Detail ? `${StatusLabels[Variant]} · ${Detail}` : StatusLabels[Variant];
		const Tone = reasonTone(User);
		const Rows: Node[] = [
			createElement('div', { Class: 'rvf-status-row' }, [
				createElement('span', {
					Class: joinClasses('rvf-status', `rvf-status--${Variant}`, Tone && `rvf-status--${Tone}`, Rc.LabelMedium),
					Text: Label
				}),
				createElement('span', {
					Class: joinClasses(Rc.BodyMedium, Rc.TextMuted),
					Text: `Tracked since ${formatDate(User.trackedSince)}`
				})
			])
		];
		for (const Flag of User.flags) {
			Rows.push(this.notice(Flag.note ? `Flagged: ${Flag.reason} (${Flag.note})` : `Flagged: ${Flag.reason}`));
		}
		if (User.flaggedAlt) Rows.push(this.notice(`Linked to flagged account @${User.flaggedAlt.username}`));
		return createElement('div', { Class: 'rvf-stack' }, Rows);
	}

	private reasonHeading(IsVerified: boolean): HTMLHeadingElement {
		return this.subheading(IsVerified ? 'Why verified?' : 'Why they were verified', '(estimate from public Roblox data)');
	}

	private reasonPlaceholder(User: ApiUserDetail | null, Options?: UserViewOptions): HTMLElement {
		const Heading = this.reasonHeading(User?.isVerified ?? true);
		if (User && !User.statsPending) return createElement('div', { Class: 'rvf-stack' }, [Heading, this.note('No stats yet.')]);
		if (Options?.PollingStopped) {
			return createElement('div', { Class: 'rvf-stack' }, [
				Heading,
				this.note('This is taking longer than usual. Reload the page in a minute.')
			]);
		}
		return createElement('div', { Class: 'rvf-stack' }, [Heading, skeletonReason()]);
	}

	private reason(User: ApiUserDetail, Stats: ApiUserStats): HTMLElement {
		const Reason = Stats.reason;
		const Bought = boughtFlag(User);
		const Others = Bought
			? [Reason.primary, ...Reason.others].filter((Other): Other is ReasonCandidate => !!Other && Other.kind !== 'PossiblyBought')
			: Reason.others;
		return createElement('div', { Class: 'rvf-stack' }, [
			this.reasonHeading(User.isVerified),
			Bought
				? this.boughtCard(Bought)
				: Reason.primary
					? this.reasonCard(Reason.primary, Reason.confidence)
					: this.note('No strong public signal. Often a brand, celebrity, or creator known off-platform.'),
			Others.length > 0 &&
				createElement(
					'div',
					{ Class: 'rvf-chip-row' },
					Others.map((Other) =>
						createElement('span', {
							Class: joinClasses('rvf-pill', Rc.SurfaceShift, Rc.BodySmall, Rc.TextDefault),
							Text: `${Other.label}: ${Other.summary}`,
							Attributes: { title: Other.evidence.join('. ') }
						})
					)
				)
		]);
	}

	private boughtCard(Flag: UserFlag): HTMLElement {
		const Lines = [`Flagged ${formatDate(Flag.createdAt)}`];
		return createElement('div', { Class: joinClasses('rvf-card', 'rvf-card--danger', Rc.SurfaceSunken, Rc.RadiusMedium, Rc.PaddingMedium) }, [
			createElement('div', { Class: 'rvf-card__header' }, [
				createElement('span', { Class: joinClasses('rvf-card__label', Rc.LabelSmall), Text: 'Bought (flagged)' }),
				createElement('span', { Class: joinClasses(Rc.LabelSmall, Rc.TextMuted), Text: 'RobloxVerifieds flag' })
			]),
			createElement('div', { Class: joinClasses(Rc.LabelMedium, Rc.TextEmphasis), Text: 'Flagged for paying for the verified badge' }),
			createElement(
				'ul',
				{ Class: joinClasses('rvf-evidence', Rc.BodyMedium, Rc.TextDefault) },
				Lines.map((Line) => createElement('li', { Text: Line }))
			)
		]);
	}

	private reasonCard(Candidate: ReasonCandidate, Confidence: string | null): HTMLElement {
		const Warning = Candidate.kind === 'PossiblyBought';
		const CardClass = joinClasses('rvf-card', Warning && 'rvf-card--warning', Rc.SurfaceSunken, Rc.RadiusMedium, Rc.PaddingMedium);
		return createElement('div', { Class: CardClass }, [
			createElement('div', { Class: 'rvf-card__header' }, [
				createElement('span', {
					Class: joinClasses('rvf-card__label', Rc.LabelSmall, !Warning && Rc.TextAccent),
					Text: Candidate.label
				}),
				Confidence &&
					createElement('span', {
						Class: joinClasses('rvf-confidence', `rvf-confidence--${Confidence}`, Rc.LabelSmall),
						Text: `${Confidence} confidence`
					})
			]),
			createElement('div', { Class: joinClasses(Rc.LabelMedium, Rc.TextEmphasis), Text: Candidate.summary }),
			createElement(
				'ul',
				{ Class: joinClasses('rvf-evidence', Rc.BodyMedium, Rc.TextDefault) },
				Candidate.evidence.map((Line) => createElement('li', { Text: Line }))
			),
			Candidate.link &&
				createElement('a', {
					Class: joinClasses('rvf-link', Rc.LabelSmall),
					Text: `View ${Candidate.link.label}`,
					Attributes: { href: Candidate.link.url }
				})
		]);
	}

	private highlights(Stats: ApiUserStats): HTMLElement {
		return createElement(
			'div',
			{ Class: 'rvf-tiles' },
			highlightValues(Stats)
				.filter(([, Value], Index) => Index === 0 || Value > 0)
				.map(([Label, Value, Caption]) => {
					const Figure = createElement('div', { Class: joinClasses(Rc.HeadingSmall, Rc.TextEmphasis) });
					countUp(Figure, Value, formatCompact);
					return createElement('div', { Class: joinClasses('rvf-tile', Rc.SurfaceSunken, Rc.RadiusMedium, Rc.PaddingMedium) }, [
						createElement('div', { Class: joinClasses(Rc.CaptionMedium, Rc.TextMuted), Text: Label }),
						Figure,
						createElement('div', { Class: joinClasses(Rc.BodySmall, Rc.TextMuted), Text: Caption })
					]);
				})
		);
	}

	private more(User: ApiUserDetail): HTMLElement | null {
		const Experiences = this.experiences(User);
		const History = this.history(User);
		if (!Experiences && !History) return null;
		return createElement('div', { Class: 'rvf-more' }, [Experiences, History]);
	}

	private experiences(User: ApiUserDetail): HTMLElement | null {
		const Stats = User.stats;
		if (!Stats) return null;
		const Games: Array<OwnGame | TopGroupGame> = [...Stats.games.top, ...Stats.groupGames.top]
			.sort((A, B) => B.visits - A.visits)
			.slice(0, TopExperienceCount);
		if (Games.length === 0) return null;
		return createElement('div', { Class: 'rvf-stack' }, [
			this.subheading('Top experiences'),
			createElement('ul', { Class: 'rvf-list' }, Games.map((Game) => this.experienceRow(Game)))
		]);
	}

	private experienceRow(Game: OwnGame | TopGroupGame): HTMLElement {
		const Context =
			'groupName' in Game
				? `${TierLabels[Game.tier]} of ${Game.groupName}`
				: Game.viaGroup
					? `Theirs, via ${Game.viaGroup}`
					: 'Their own experience';
		const Playing = Game.playing > 0 ? `, ${formatCompact(Game.playing)} playing` : '';
		return createElement('li', { Class: joinClasses('rvf-list__row', Rc.RadiusMedium) }, [
			createElement('a', {
				Class: joinClasses(Rc.LabelMedium, Rc.TextEmphasis, 'rvf-list__title'),
				Text: Game.name,
				Attributes: { href: RobloxPage.robloxGameUrl(Game.placeId) }
			}),
			createElement('span', {
				Class: joinClasses(Rc.BodySmall, Rc.TextMuted),
				Text: `${Context}. ${formatCompact(Game.visits)} visits${Playing}`
			})
		]);
	}

	private history(User: ApiUserDetail): HTMLElement | null {
		if (User.history.length === 0) return null;
		return createElement('div', { Class: 'rvf-stack' }, [
			this.subheading('Verification history'),
			createElement(
				'ul',
				{ Class: 'rvf-timeline' },
				User.history.slice(0, HistoryCount).map((Entry) =>
					createElement('li', { Class: `rvf-timeline__item rvf-timeline__item--${Entry.isVerified ? 'on' : 'off'}` }, [
						createElement('span', {
							Class: joinClasses(Rc.BodyMedium, Rc.TextEmphasis),
							Text: Entry.isVerified ? 'Verified badge present' : 'Verified badge removed'
						}),
						createElement('span', { Class: joinClasses(Rc.BodySmall, Rc.TextMuted), Text: formatDate(Entry.observedAt) })
					])
				)
			)
		]);
	}

	private footer(User: ApiUserDetail): HTMLElement {
		const Updated = User.statsUpdatedAt ? `, last updated ${formatRelative(User.statsUpdatedAt)}` : '';
		const Refresh = this.RefreshHandler;
		return createElement('div', { Class: 'rvf-footer' }, [
			createElement('p', {
				Class: joinClasses(Rc.BodySmall, Rc.TextMuted, 'rvf-note'),
				Text: `Stats refresh every 24 hours${Updated}.`
			}),
			Refresh &&
				!User.isBanned &&
				createElement('button', {
					Class: joinClasses('rvf-text-button', Rc.BodySmall),
					Text: User.statsPending ? 'Refreshing' : 'Refresh now',
					Attributes: User.statsPending ? { type: 'button', disabled: '' } : { type: 'button' },
					On: { click: Refresh }
				})
		]);
	}

	private subheading(Title: string, Aside?: string): HTMLHeadingElement {
		return createElement('h3', { Class: joinClasses(Rc.LabelMedium, Rc.TextEmphasis, 'rvf-subheading') }, [
			Title,
			Aside && createElement('span', { Class: joinClasses(Rc.TextMuted, 'rvf-subheading__aside'), Text: Aside })
		]);
	}

	private note(Message: string): HTMLParagraphElement {
		return createElement('p', { Class: joinClasses(Rc.BodyMedium, Rc.TextMuted, 'rvf-note'), Text: Message });
	}

	private notice(Message: string): HTMLDivElement {
		return createElement('div', { Class: joinClasses('rvf-notice', Rc.RadiusMedium, Rc.BodyMedium), Text: Message });
	}

	private button(Label: string, onClick: () => void, Secondary = false): HTMLButtonElement {
		return createElement('button', {
			Class: joinClasses('rvf-button', Secondary && 'rvf-button--secondary', Rc.LabelMedium, Rc.RadiusMedium),
			Text: Label,
			Attributes: { type: 'button' },
			On: { click: onClick }
		});
	}
}

function highlightValues(Stats: ApiUserStats): Array<[Label: string, Value: number, Caption: string]> {
	return [
		['Followers', Stats.followers, `${formatCompact(Stats.friends)} friends`],
		['Own experiences', Stats.games.visits, `visits across ${Stats.games.count}`],
		['Group experiences', Stats.groupGames.visits, `visits across ${Stats.groupGames.count}`],
		['UGC favorites', Stats.ugc.sampledFavorites, `on top ${Stats.ugc.sampledCount} items`]
	];
}

function keyOf(Value: unknown): string {
	return JSON.stringify(Value) ?? 'null';
}
