import { context } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { dirname, join } from 'node:path';

const OutDir = 'Dist';
const IsWatch = process.argv.includes('--watch');

const Bundles = [
	{ Entry: 'Src/Background/Background.ts', Output: 'Background.js', Format: 'esm' },
	{ Entry: 'Src/Content/Content.ts', Output: 'Content.js', Format: 'iife' },
	{ Entry: 'Src/Popup/Popup.ts', Output: 'Popup.js', Format: 'esm' }
];

const StaticFiles = [
	{ From: 'Public/manifest.json', To: 'manifest.json' },
	{ From: 'Src/Content/Content.css', To: 'Content.css' },
	{ From: 'Src/Popup/Popup.html', To: 'Popup.html' },
	{ From: 'Src/Popup/Popup.css', To: 'Popup.css' },
	...[16, 32, 48, 128].map((Size) => ({ From: `Public/Icons/Icon${Size}.png`, To: `Icons/Icon${Size}.png` }))
];

async function writeManifest(From, Target) {
	const { version: Version } = JSON.parse(await readFile('package.json', 'utf8'));
	const Manifest = JSON.parse(await readFile(From, 'utf8'));
	await writeFile(Target, `${JSON.stringify({ ...Manifest, version: Version }, null, '\t')}\n`);
}

async function copyStatic() {
	for (const File of StaticFiles) {
		const Target = join(OutDir, File.To);
		await mkdir(dirname(Target), { recursive: true });
		if (File.To === 'manifest.json') await writeManifest(File.From, Target);
		else await copyFile(File.From, Target);
	}
}

function watchStatic() {
	for (const File of StaticFiles) {
		watch(File.From, () => copyStatic().catch((Err) => console.error(Err.message)));
	}
}

async function createContexts() {
	return Promise.all(
		Bundles.map((Bundle) =>
			context({
				entryPoints: [Bundle.Entry],
				outfile: join(OutDir, Bundle.Output),
				bundle: true,
				format: Bundle.Format,
				target: 'chrome120',
				sourcemap: IsWatch ? 'inline' : false,
				minify: !IsWatch,
				logLevel: 'info'
			})
		)
	);
}

await rm(OutDir, { recursive: true, force: true });
await copyStatic();
const Contexts = await createContexts();

if (IsWatch) {
	await Promise.all(Contexts.map((Context) => Context.watch()));
	watchStatic();
	console.log(`Watching. Load ${OutDir}/ as an unpacked extension.`);
} else {
	await Promise.all(Contexts.map((Context) => Context.rebuild()));
	await Promise.all(Contexts.map((Context) => Context.dispose()));
	console.log(`Built to ${OutDir}/`);
}
