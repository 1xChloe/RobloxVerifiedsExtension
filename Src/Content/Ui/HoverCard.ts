import { RobloxClasses } from '../Roblox/RobloxDom';
import { OwnRootAttribute, createElement } from './Element';

const ShowDelayMs = 150;
const HideDelayMs = 200;
const ViewportMargin = 8;
const AnchorGap = 6;

export class HoverCard {
	private readonly Root: HTMLDivElement;
	private ShowTimer: number | undefined;
	private HideTimer: number | undefined;

	constructor() {
		this.Root = createElement('div', {
			Class: `rvf-hover-card ${RobloxClasses.SurfaceRaised} ${RobloxClasses.RadiusMedium}`,
			Attributes: { [OwnRootAttribute]: '', role: 'tooltip' },
			On: {
				mouseenter: () => window.clearTimeout(this.HideTimer),
				mouseleave: () => this.scheduleHide()
			}
		});
		window.addEventListener('scroll', () => this.hide(), { passive: true, capture: true });
	}

	attach(Anchor: HTMLElement, render: () => Node[]): void {
		const open = () => this.scheduleShow(Anchor, render);
		Anchor.addEventListener('mouseenter', open);
		Anchor.addEventListener('focus', open);
		Anchor.addEventListener('mouseleave', () => this.scheduleHide());
		Anchor.addEventListener('blur', () => this.scheduleHide());
	}

	hide(): void {
		window.clearTimeout(this.ShowTimer);
		this.Root.remove();
	}

	private scheduleShow(Anchor: HTMLElement, render: () => Node[]): void {
		window.clearTimeout(this.HideTimer);
		window.clearTimeout(this.ShowTimer);
		this.ShowTimer = window.setTimeout(() => this.show(Anchor, render()), ShowDelayMs);
	}

	private scheduleHide(): void {
		window.clearTimeout(this.ShowTimer);
		window.clearTimeout(this.HideTimer);
		this.HideTimer = window.setTimeout(() => this.hide(), HideDelayMs);
	}

	private show(Anchor: HTMLElement, Content: Node[]): void {
		if (!Anchor.isConnected) return;
		this.Root.replaceChildren(...Content);
		document.body.append(this.Root);
		this.position(Anchor);
	}

	private position(Anchor: HTMLElement): void {
		const AnchorRect = Anchor.getBoundingClientRect();
		const CardRect = this.Root.getBoundingClientRect();
		const FitsBelow = AnchorRect.bottom + AnchorGap + CardRect.height <= window.innerHeight - ViewportMargin;
		const Top = FitsBelow ? AnchorRect.bottom + AnchorGap : AnchorRect.top - AnchorGap - CardRect.height;
		const MaxLeft = window.innerWidth - CardRect.width - ViewportMargin;
		const Left = Math.max(ViewportMargin, Math.min(AnchorRect.left, MaxLeft));
		this.Root.style.top = `${Math.max(ViewportMargin, Top)}px`;
		this.Root.style.left = `${Left}px`;
	}
}
