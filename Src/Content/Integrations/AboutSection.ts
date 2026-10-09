import { RobloxPage } from '../Roblox/RobloxDom';
import { OwnRootAttribute, createElement } from '../Ui/Element';

export class AboutSection {
	readonly Container = createElement('section', {
		Class: 'rvf-about-section',
		Attributes: { [OwnRootAttribute]: '', 'aria-label': 'RobloxVerifieds' }
	});

	attach(): boolean {
		const Pane = RobloxPage.profileAboutPane();
		if (!Pane) return false;
		if (this.Container.parentElement !== Pane || Pane.firstElementChild !== this.Container) {
			Pane.prepend(this.Container);
		}
		return true;
	}

	detach(): void {
		this.Container.remove();
	}

	reveal(): void {
		RobloxPage.showProfileAbout();
		this.Container.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
}
