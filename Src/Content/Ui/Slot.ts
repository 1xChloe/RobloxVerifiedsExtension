import { createElement } from './Element';

export const EnterClass = 'rvf-enter';

export class Slot {
	readonly Root = createElement('div', { Class: 'rvf-slot' });
	private Key: string | null = null;

	constructor() {
		this.Root.hidden = true;
	}

	get IsEmpty(): boolean {
		return this.Root.childElementCount === 0;
	}

	set(Key: string, build: () => Node | null, Animate = true): void {
		if (Key === this.Key) return;
		this.Key = Key;
		const Content = build();
		this.Root.replaceChildren(...(Content ? [Content] : []));
		this.Root.hidden = !Content;
		if (Animate && Content instanceof Element) Content.classList.add(EnterClass);
	}

	clear(): void {
		this.Key = null;
		this.Root.replaceChildren();
		this.Root.hidden = true;
	}
}
