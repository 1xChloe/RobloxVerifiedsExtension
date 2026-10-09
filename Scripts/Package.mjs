import { crc32, deflateRawSync } from 'node:zlib';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const DistDir = 'Dist';
const Utf8NameFlag = 0x0800;
const DeflateMethod = 8;
const ZipVersion = 20;

async function listFiles(Directory) {
	const Entries = await readdir(Directory, { withFileTypes: true });
	const Nested = await Promise.all(
		Entries.map((Entry) => {
			const Path = join(Directory, Entry.name);
			return Entry.isDirectory() ? listFiles(Path) : [Path];
		})
	);
	return Nested.flat();
}

function dosTimestamp(Moment) {
	const Time = (Moment.getHours() << 11) | (Moment.getMinutes() << 5) | Math.floor(Moment.getSeconds() / 2);
	const Day = ((Moment.getFullYear() - 1980) << 9) | ((Moment.getMonth() + 1) << 5) | Moment.getDate();
	return { Time, Day };
}

function buildZip(Files) {
	const { Time, Day } = dosTimestamp(new Date());
	const LocalParts = [];
	const CentralParts = [];
	let Offset = 0;

	for (const File of Files) {
		const Name = Buffer.from(File.Name, 'utf8');
		const Compressed = deflateRawSync(File.Data, { level: 9 });
		const Checksum = crc32(File.Data);

		const Local = Buffer.alloc(30);
		Local.writeUInt32LE(0x04034b50, 0);
		Local.writeUInt16LE(ZipVersion, 4);
		Local.writeUInt16LE(Utf8NameFlag, 6);
		Local.writeUInt16LE(DeflateMethod, 8);
		Local.writeUInt16LE(Time, 10);
		Local.writeUInt16LE(Day, 12);
		Local.writeUInt32LE(Checksum, 14);
		Local.writeUInt32LE(Compressed.length, 18);
		Local.writeUInt32LE(File.Data.length, 22);
		Local.writeUInt16LE(Name.length, 26);
		LocalParts.push(Local, Name, Compressed);

		const Central = Buffer.alloc(46);
		Central.writeUInt32LE(0x02014b50, 0);
		Central.writeUInt16LE(ZipVersion, 4);
		Central.writeUInt16LE(ZipVersion, 6);
		Central.writeUInt16LE(Utf8NameFlag, 8);
		Central.writeUInt16LE(DeflateMethod, 10);
		Central.writeUInt16LE(Time, 12);
		Central.writeUInt16LE(Day, 14);
		Central.writeUInt32LE(Checksum, 16);
		Central.writeUInt32LE(Compressed.length, 20);
		Central.writeUInt32LE(File.Data.length, 24);
		Central.writeUInt16LE(Name.length, 28);
		Central.writeUInt32LE(Offset, 42);
		CentralParts.push(Central, Name);

		Offset += Local.length + Name.length + Compressed.length;
	}

	const CentralSize = CentralParts.reduce((Total, Part) => Total + Part.length, 0);
	const End = Buffer.alloc(22);
	End.writeUInt32LE(0x06054b50, 0);
	End.writeUInt16LE(Files.length, 8);
	End.writeUInt16LE(Files.length, 10);
	End.writeUInt32LE(CentralSize, 12);
	End.writeUInt32LE(Offset, 16);

	return Buffer.concat([...LocalParts, ...CentralParts, End]);
}

const Manifest = JSON.parse(await readFile(join(DistDir, 'manifest.json'), 'utf8'));
const Paths = (await listFiles(DistDir)).filter((Path) => !Path.endsWith('.map'));
const Files = await Promise.all(
	Paths.map(async (Path) => ({ Name: relative(DistDir, Path).split(sep).join('/'), Data: await readFile(Path) }))
);
const Output = `RobloxVerifieds-${Manifest.version}.zip`;
await writeFile(Output, buildZip(Files));
console.log(`Packaged ${Files.length} files into ${Output}`);
