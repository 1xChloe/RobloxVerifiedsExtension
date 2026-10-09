import type { Integration } from './Integrations/Integration';
import { OwnRootAttribute, isOwnNode } from './Ui/Element';

const ThrottleMs = 100;

export class PageWatcher {
	private Timer: number | undefined;
	private Running = false;
	private Rerun = false;

	constructor(private readonly Integrations: Integration[]) {}

	start(): void {
		new MutationObserver((Mutations) => {
			if (Mutations.some((Mutation) => !this.isOwnMutation(Mutation))) this.schedule();
		}).observe(document.body, { childList: true, subtree: true });
		this.schedule();
	}

	schedule(): void {
		if (this.Timer !== undefined) return;
		this.Timer = window.setTimeout(() => {
			this.Timer = undefined;
			void this.run();
		}, ThrottleMs);
	}

	private async run(): Promise<void> {
		if (this.Running) {
			this.Rerun = true;
			return;
		}
		this.Running = true;
		for (const Feature of this.Integrations) {
			try {
				await Feature.update();
			} catch (Err) {
				console.debug('[RobloxVerifieds]', (Err as Error).message);
			}
		}
		this.Running = false;
		if (this.Rerun) {
			this.Rerun = false;
			this.schedule();
		}
	}

	private isOwnMutation(Mutation: MutationRecord): boolean {
		const Changed = [...Mutation.addedNodes, ...Mutation.removedNodes];
		return Changed.length > 0 && Changed.every((Target) => isOwnNode(Target) || this.isOwnDetached(Target));
	}

	private isOwnDetached(Target: Node): boolean {
		return Target instanceof Element && Target.hasAttribute(OwnRootAttribute);
	}
}
