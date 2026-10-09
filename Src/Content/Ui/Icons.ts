const SvgNamespace = 'http://www.w3.org/2000/svg';

export interface IconShape {
	Paths: string[];
	Dashed?: string[];
}

export const Icons = {
	Group: {
		Paths: [
			'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
			'M2.5 20.5c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6',
			'M15.5 4.3a3.5 3.5 0 0 1 0 6.4',
			'M18 14.8c2.1.7 3.5 2.8 3.5 5.7'
		]
	},
	Controller: {
		Paths: [
			'M7 7h10a5 5 0 0 1 5 5v1.5a3.5 3.5 0 0 1-6.3 2.1L14.5 14h-5l-1.2 1.6A3.5 3.5 0 0 1 2 13.5V12a5 5 0 0 1 5-5z',
			'M7.5 9.5v4',
			'M5.5 11.5h4',
			'M16 10.5h.01',
			'M18 12.5h.01'
		]
	},
	Hammer: { Paths: ['M14.5 3.5l6 6-2.5 2.5-6-6z', 'M14.5 9.5L4 20'] },
	Shirt: { Paths: ['M9 3.5c.5 1.5 1.6 2.5 3 2.5s2.5-1 3-2.5l5.5 2.5-2 4.5-2.5-1v11h-8v-11l-2.5 1-2-4.5z'] },
	Camera: {
		Paths: [
			'M3.5 7h10a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 2 15.5v-7A1.5 1.5 0 0 1 3.5 7z',
			'M15 10.5l6-3.5v10l-6-3.5'
		]
	},
	Star: { Paths: ['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'] },
	Shield: { Paths: ['M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z', 'M9 12l2 2 4-4'] },
	History: { Paths: ['M3.5 12a8.5 8.5 0 1 0 2.5-6', 'M3.5 4v4h4', 'M12 8v4l3 2'] },
	Warning: {
		Paths: [
			'M10.3 4.2L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z',
			'M12 9.5v4',
			'M12 17h.01'
		]
	},
	Flag: { Paths: ['M5 21V4', 'M5 4.5h11.5l-2 4 2 4H5'] },
	Banned: { Paths: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M5.6 5.6l12.8 12.8'] },
	ExVerified: { Paths: ['M8.5 12l2.5 2.5 4.5-4.5'], Dashed: ['M12 2.5l9.5 9.5-9.5 9.5L2.5 12z'] }
} satisfies Record<string, IconShape>;

export function iconSvg(Shape: IconShape): SVGSVGElement {
	const Svg = document.createElementNS(SvgNamespace, 'svg');
	const Attributes: Record<string, string> = {
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		'stroke-width': '2',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
		'aria-hidden': 'true',
		focusable: 'false'
	};
	for (const [Name, Value] of Object.entries(Attributes)) Svg.setAttribute(Name, Value);
	const addPath = (D: string, Dashed: boolean) => {
		const Path = document.createElementNS(SvgNamespace, 'path');
		Path.setAttribute('d', D);
		if (Dashed) Path.setAttribute('stroke-dasharray', '3 2.4');
		Svg.append(Path);
	};
	for (const D of Shape.Paths) addPath(D, false);
	for (const D of Shape.Dashed ?? []) addPath(D, true);
	return Svg;
}
