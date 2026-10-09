type Child = Node | string | null | undefined | false;

type EventHandlers = {
	[K in keyof HTMLElementEventMap]?: (Event: HTMLElementEventMap[K]) => void;
};

export interface ElementOptions {
	Class?: string;
	Text?: string;
	Attributes?: Record<string, string>;
	On?: EventHandlers;
}

export const OwnRootAttribute = 'data-rvf-root';

export function createElement<K extends keyof HTMLElementTagNameMap>(
	Tag: K,
	Options: ElementOptions = {},
	Children: Child[] = []
): HTMLElementTagNameMap[K] {
	const Created = document.createElement(Tag);
	if (Options.Class) Created.className = Options.Class;
	if (Options.Text !== undefined) Created.textContent = Options.Text;
	for (const [Name, Value] of Object.entries(Options.Attributes ?? {})) Created.setAttribute(Name, Value);
	for (const [Name, Handler] of Object.entries(Options.On ?? {})) {
		Created.addEventListener(Name, Handler as EventListener);
	}
	for (const Item of Children) if (Item) Created.append(Item);
	return Created;
}

export function joinClasses(...Parts: Array<string | false | null | undefined>): string {
	return Parts.filter(Boolean).join(' ');
}

export function isOwnNode(Target: Node | null): boolean {
	const Host = Target instanceof Element ? Target : Target?.parentElement;
	return !!Host?.closest(`[${OwnRootAttribute}]`);
}

export function externalLink(Text: string, Href: string, Class: string): HTMLAnchorElement {
	return createElement('a', {
		Class,
		Text,
		Attributes: { href: Href, target: '_blank', rel: 'noopener noreferrer' }
	});
}
