import { RobloxClasses } from '../Roblox/RobloxDom';
import { createElement, joinClasses } from './Element';

export type SkeletonWidth = 'short' | 'medium' | 'long';

function bar(...Modifiers: string[]): HTMLDivElement {
	return createElement('div', {
		Class: joinClasses('rvf-skeleton', ...Modifiers.map((Modifier) => `rvf-skeleton--${Modifier}`))
	});
}

function panel(Extra: string, Children: HTMLElement[]): HTMLDivElement {
	return createElement(
		'div',
		{
			Class: joinClasses(Extra, RobloxClasses.SurfaceSunken, RobloxClasses.RadiusMedium, RobloxClasses.PaddingMedium)
		},
		Children
	);
}

export function skeletonLines(Widths: SkeletonWidth[]): HTMLDivElement {
	return createElement(
		'div',
		{ Class: 'rvf-stack', Attributes: { 'aria-hidden': 'true' } },
		Widths.map((Width) => bar('line', Width))
	);
}

export function skeletonReason(): HTMLDivElement {
	const Card = panel('rvf-card rvf-skeleton-card', [
		createElement('div', { Class: 'rvf-card__header' }, [bar('line', 'label'), bar('line', 'tag')]),
		bar('line', 'title'),
		createElement('div', { Class: 'rvf-skeleton-list' }, [
			bar('line', 'long'),
			bar('line', 'medium'),
			bar('line', 'long'),
			bar('line', 'short')
		])
	]);
	Card.setAttribute('aria-hidden', 'true');
	return Card;
}

export function skeletonTiles(Count: number): HTMLDivElement {
	return createElement(
		'div',
		{ Class: 'rvf-tiles', Attributes: { 'aria-hidden': 'true' } },
		Array.from({ length: Count }, () =>
			panel('rvf-tile rvf-skeleton-tile', [bar('line', 'label'), bar('line', 'figure'), bar('line', 'caption')])
		)
	);
}
