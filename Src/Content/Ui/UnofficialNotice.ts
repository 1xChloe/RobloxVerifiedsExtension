import { StoreUrl, UnofficialMessage } from '../../Shared/Official';
import { createElement, externalLink, OwnRootAttribute } from './Element';

export function showUnofficialNotice(): void {
	const Notice = createElement('div', { Class: 'rvf-unofficial', Attributes: { [OwnRootAttribute]: '', role: 'alert' } });
	Notice.append(
		createElement('p', { Class: 'rvf-unofficial__text', Text: UnofficialMessage }),
		createElement('div', { Class: 'rvf-unofficial__actions' }, [
			externalLink('Get the official extension', StoreUrl, 'rvf-unofficial__link'),
			createElement('button', {
				Class: 'rvf-unofficial__hide',
				Text: 'Hide',
				Attributes: { type: 'button' },
				On: { click: () => Notice.remove() }
			})
		])
	);
	document.body.append(Notice);
}
