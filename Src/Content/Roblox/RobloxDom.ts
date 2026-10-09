export const RobloxSelectors = {
	ProfileName: '#profile-header-title-container-name',
	ProfileAboutTab: '#tab-about',
	ProfileAboutPane: 'ul.profile-tabs ~ .profile-tab-content',
	ProfileHeader: '.user-profile-header',
	VerifiedIcon: '.icon-filled-verified-check, .icon-filled-verified-backplate, [class*="verified-badge"]',
	UserLink: 'a[href*="/users/"]',

	NoTagZones: '.friend-tile-dropdown, .friends-carousel-tile, [role="tooltip"], [role="dialog"], [role="menu"]',
	TileDropdown: '.friend-tile-dropdown'
} as const;

export type TilePlacement = 'Below' | 'AfterName';

export const RobloxTiles: ReadonlyArray<{ Root: string; Anchor: string | null; Place: TilePlacement }> = [
	{ Root: '.friends-carousel-tile', Anchor: '.friends-carousel-tile-sublabel, .friends-carousel-tile-label', Place: 'Below' },
	{ Root: '.avatar-card-container', Anchor: null, Place: 'AfterName' }
];

export interface TileSpot {
	Root: HTMLElement;
	Anchor: HTMLElement;
	Place: TilePlacement;
	Inside: boolean;
}

export const RobloxClasses = {
	Hidden: 'hidden',
	SectionHeading: 'content-emphasis text-heading-small padding-none',
	TextEmphasis: 'content-emphasis',
	TextDefault: 'content-default',
	TextMuted: 'content-muted',
	TextAccent: 'content-system-emphasis',
	HeadingSmall: 'text-heading-small',
	BodyMedium: 'text-body-medium',
	BodySmall: 'text-body-small',
	LabelMedium: 'text-label-medium',
	LabelSmall: 'text-label-small',
	CaptionMedium: 'text-caption-medium',
	SurfaceSunken: 'bg-surface-100',
	SurfaceRaised: 'bg-surface-200',
	SurfaceShift: 'bg-shift-100',
	RadiusMedium: 'radius-medium',
	PaddingMedium: 'padding-medium'
} as const;

const ProfilePathPattern = /^\/users\/(\d+)\/profile/;
const UserHrefPattern = /\/users\/(\d+)\/profile/;

export class RobloxPage {
	static profileUserId(): number | null {
		const Match = ProfilePathPattern.exec(location.pathname);
		return Match ? Number(Match[1]) : null;
	}

	static userIdFromHref(Href: string | null): number | null {
		const Match = UserHrefPattern.exec(Href ?? '');
		return Match ? Number(Match[1]) : null;
	}

	static tileRoots(): HTMLElement[] {
		return [...document.querySelectorAll<HTMLElement>(RobloxTiles.map((Tile) => Tile.Root).join(', '))];
	}

	static tileFor(Inner: Element): TileSpot | null {
		for (const Tile of RobloxTiles) {
			const Root = Inner.closest<HTMLElement>(Tile.Root);
			if (!Root) continue;
			if (Tile.Anchor) {
				const Anchor = RobloxPage.lastOutsideDropdown(Root, Tile.Anchor);
				if (Anchor) return { Root, Anchor, Place: Tile.Place, Inside: false };
				continue;
			}
			const Name = RobloxPage.nameLink(Root);
			if (!Name) continue;
			const Row = Name.parentElement;
			const RowIsName = !!Row && (Row.textContent ?? '').trim() === (Name.textContent ?? '').trim();
			return { Root, Anchor: RowIsName ? Row : Name, Place: Tile.Place, Inside: RowIsName };
		}
		return null;
	}

	private static lastOutsideDropdown(Root: HTMLElement, Selector: string): HTMLElement | null {
		const Found = [...Root.querySelectorAll<HTMLElement>(Selector)].filter((Item) => !Item.closest(RobloxSelectors.TileDropdown));
		return Found.at(-1) ?? null;
	}

	private static nameLink(Root: HTMLElement): HTMLAnchorElement | null {
		return (
			[...Root.querySelectorAll<HTMLAnchorElement>(RobloxSelectors.UserLink)].find(
				(Link) => !Link.closest(RobloxSelectors.TileDropdown) && (Link.textContent ?? '').trim().length > 0
			) ?? null
		);
	}

	static tileUserId(Root: HTMLElement): number | null {
		const Links = [...Root.querySelectorAll<HTMLAnchorElement>(RobloxSelectors.UserLink)];
		const Preferred = Links.find((Link) => !Link.closest(RobloxSelectors.TileDropdown)) ?? Links[0];
		return Preferred ? RobloxPage.userIdFromHref(Preferred.getAttribute('href')) : null;
	}

	static profileNameElement(): HTMLElement | null {
		return document.querySelector<HTMLElement>(RobloxSelectors.ProfileName);
	}

	static profileAboutPane(): HTMLElement | null {
		return document.querySelector<HTMLElement>(RobloxSelectors.ProfileAboutPane);
	}

	static showProfileAbout(): void {
		const Pane = RobloxPage.profileAboutPane();
		if (Pane?.classList.contains(RobloxClasses.Hidden)) {
			document.querySelector<HTMLElement>(RobloxSelectors.ProfileAboutTab)?.click();
		}
	}

	static profileShowsVerifiedBadge(): boolean {
		return !!RobloxPage.profileNameElement()?.parentElement?.querySelector(RobloxSelectors.VerifiedIcon);
	}

	static robloxGameUrl(PlaceId: number): string {
		return `https://www.roblox.com/games/${PlaceId}`;
	}

	static robloxGroupUrl(GroupId: number): string {
		return `https://www.roblox.com/communities/${GroupId}`;
	}

	static robloxProfileUrl(UserId: number): string {
		return `https://www.roblox.com/users/${UserId}/profile`;
	}
}
