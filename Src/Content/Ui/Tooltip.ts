import { OwnRootAttribute, createElement } from './Element';

const ShowDelayMs = 80;
const AnchorGap = 8;
const ViewportMargin = 8;

export class Tooltip {
	private readonly Root: HTMLDivElement;
	private ShowTimer: number | undefined;

	constructor() {
		this.Root = createElement('div', { Class: 'rvf-tooltip', Attributes: { [OwnRootAttribute]: '', role: 'tooltip' } });
		window.addEventListener('scroll', () => this.hide(), { passive: true, capture: true });
	}

	attach(Anchor: HTMLElement, render: () => Node[]): void {
		const open = () => {
			window.clearTimeout(this.ShowTimer);
			this.ShowTimer = window.setTimeout(() => this.show(Anchor, render()), ShowDelayMs);
		};
		Anchor.addEventListener('mouseenter', open);
		Anchor.addEventListener('focus', open);
		Anchor.addEventListener('mouseleave', () => this.hide());
		Anchor.addEventListener('blur', () => this.hide());
		Anchor.addEventListener('click', () => this.hide());
	}

	hide(): void {
		window.clearTimeout(this.ShowTimer);
		this.Root.remove();
	}

	private show(Anchor: HTMLElement, Content: Node[]): void {
		if (!Anchor.isConnected) return;
		this.Root.replaceChildren(...Content);
		document.body.append(this.Root);
		const AnchorRect = Anchor.getBoundingClientRect();
		const TipRect = this.Root.getBoundingClientRect();
		const FitsBelow = AnchorRect.bottom + AnchorGap + TipRect.height <= window.innerHeight - ViewportMargin;
		const Top = FitsBelow ? AnchorRect.bottom + AnchorGap : AnchorRect.top - AnchorGap - TipRect.height;
		const Centered = AnchorRect.left + AnchorRect.width / 2 - TipRect.width / 2;
		const Left = Math.max(ViewportMargin, Math.min(Centered, window.innerWidth - TipRect.width - ViewportMargin));
		this.Root.style.top = `${Math.max(ViewportMargin, Top)}px`;
		this.Root.style.left = `${Left}px`;
	}
}
