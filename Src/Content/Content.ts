import { isOfficialBuild } from '../Shared/Official';
import { Settings } from '../Shared/Settings';
import { ProfileIntegration } from './Integrations/ProfileIntegration';
import { SightingIntegration } from './Integrations/SightingIntegration';
import { TileTagIntegration } from './Integrations/TileTagIntegration';
import { UserLinkIntegration } from './Integrations/UserLinkIntegration';
import { PageWatcher } from './PageWatcher';
import { HoverCard } from './Ui/HoverCard';
import { showUnofficialNotice } from './Ui/UnofficialNotice';

async function start(): Promise<void> {
	if (!isOfficialBuild()) {
		showUnofficialNotice();
		return;
	}
	await Settings.load();
	const Cards = new HoverCard();
	const Watcher = new PageWatcher([
		new ProfileIntegration(Cards),
		new UserLinkIntegration(Cards),
		new TileTagIntegration(),
		new SightingIntegration()
	]);
	Settings.onChange(() => Watcher.schedule());
	Watcher.start();
}

void start();
