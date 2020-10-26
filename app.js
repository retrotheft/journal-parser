const fs = require('fs');
const pdfParse = require('pdf-parse');

console.log("Welcome to PDF Parser");

const journal = '42';

const pdfFile = fs.readFileSync(`./journals/${journal}.pdf`);

const dir = `./output/${journal}`;

if (!fs.existsSync(dir)) {
	fs.mkdirSync(dir);
}

pdfParse(pdfFile)
	.then(function (data) {
		fs.writeFileSync(`${dir}/text.md`, data.text);
		parseString(data.text);
	})

function parseString(text) {
	const array = text.split('\n');
	const metadata = determineDocMetaData(array);
	array.forEach((line, index) => {
		const check = checkIsHeader(line, metadata);
		if (check) array.splice(index, 1);
	})
	let periodIndexes = findPeriodIndexes(array);
	const contents = array.splice(0, getLastKeyInMap(periodIndexes) + 1);
	fs.writeFileSync(`${dir}/contents.md`, contents);
	const sectionLines = extractTOC(contents, periodIndexes);
	const sections = createSections(sectionLines);
	console.log("Sections:");
	console.log(sections);
	// Need to find the indexes again since some strings have been lengthened
	// periodIndexes = findPeriodIndexes(sectionLines);
	// periodIndexes.forEach((cursor, index) => {

	// })
	// const mappedArray = sectionLines.map(str => {
	// 	return str.replace(/[.]/g, ""); // this might remove periods we don't want to take
	// })
	// console.log(mappedArray);
	// const sectionPages = mappedArray.map((str, index) => {
	// 	const cursorStart = periodIndexes.get(index);
	// 	const title = str.substring(0, cursorStart).trim();
	// 	const metadata = str.substring(cursorStart).trim();
	// 	const array = metadata.split(' ');
	// 	const page = array[0];
	// 	const number = array[1] ? parseInt(array[1]) : null;
	// 	return { title, page, number };
	// })
	const filteredArray = removeEmptyLines(array);
	appendBodiesAdvanced(filteredArray, sections);
	fs.writeFileSync(`./output/${journal}/lines.json`, JSON.stringify(filteredArray));
	fs.writeFileSync(`./output/${journal}/sections.json`, JSON.stringify(sections));
}

// this should receive the post-extractTOC array of lines
function createSections(lines) {
	const array = [];
	lines.forEach(line => {
		const words = line.trim().split(' ');
		const number = words.shift();
		const page = words.pop();
		const title = words.join(' ').trim();
		array.push({ number, title, page });
	})
	return array;
}

function extractTOC(contents, periodIndexes) {
	const array = [];
	const buffer = [];
	let currentSection = 1;
	let foundSectionNum = null;
	contents.forEach((line, index) => {
		// code for extracting section Number should be here
		if (!foundSectionNum) {
			({ foundSectionNum, line } = extractSectionNumber(line, currentSection, foundSectionNum));
		}
		// condense each TOC item onto a single line
		if (periodIndexes.has(index)) {
			let string = '';
			line = line.replace(/[.]/g, "");
			// if buffer holds any strings, add them to the beginning of the line.
			// however, the first line should have the Section Number.
			// This should be at the start of the first line, but sometimes at the end. :(
			while (buffer.length > 0) {
				string += buffer.shift();
			}
			string += line; // once buffer is empty, add the period line to the end.
			if (foundSectionNum) {
				string = foundSectionNum + ' ' + string; // add SectionNum to start of string
				foundSectionNum = null;
			}
			array.push(string);
			buffer.length = 0;
			currentSection++
		} else {
			buffer.push(line);
		}
	})
	console.log("Returning TOC:");
	console.log(array);
	return array;
}

// this still needs to deal with end of line Section Nums not preceded by space
// 28, 31, and 36 in journal 43 for example.

function extractSectionNumber(line, currentSection, foundSectionNum) {
	const words = line.split(' ');
	const index = words.findIndex(word => word == currentSection);
	if (index > -1) foundSectionNum = parseInt(words.splice(index, 1)[0]);
	console.log("Found: ", foundSectionNum);
	const string = words.join(' ').trim();
	return { foundSectionNum, line: string };
}

function findPeriodIndexes(array) {
	const searchTerm = '....';
	let map = new Map();
	array.forEach((line, index) => {
		if (line.includes(searchTerm)) map.set(index, line.indexOf(searchTerm));
	})
	return map;
}

function getLastKeyInMap(map) {
	return Array.from(map)[map.size - 1][0]
}

function appendBodiesAdvanced(array, sections) {
	const bodyIndexes = new Map();
	const titleLengths = new Map();
	sections.forEach(section => {
		console.log(`Finding section ${section.number} - ${section.title}`);
		// first look for exact match - contains number and title
		let index;
		let length;
		index = array.findIndex(line => {
			length = section.title.split(' ').length;
			return line.includes(section.number) && line.includes(section.title);
		})
		// if failed, look for a match with number and decreasing number of words 5 down
		if (index === -1) {
			titleLengths.set(section.number, length);
			console.log(`No Exact Match found for ${section.number} - ${section.title}`);
		}
		bodyIndexes.set(section.number, index);
		if (index) console.log(`${section.number} begins at line ${index}`);
	})
	console.log("Body Indexes: ", bodyIndexes);
	console.log("Title Lengths: ", titleLengths);
	addSectionBodies(sections, bodyIndexes, array);
}

function appendBodies(array, sections) {
	console.log(`Appending bodies to sections`);
	const bodyIndexes = new Map();
	sections.forEach(section => {
		console.log(`Finding section ${section.number} - ${section.title}`)
		let index;
		index = array.findIndex(line => {
			if (!section.number) return;
			const wordsLine = line.trim().split(' ');
			const wordsTitle = section.title.split(' ');
			const numToMatch = cleanupSectionNumber(wordsLine[wordsLine.length - 1], section.number.toString().length);
			return wordsLine[0].trim() === wordsTitle[0].trim() && numToMatch === section.number.toString();
		})
		// 
		if (index === -1) {
			index = array.findIndex(line => {
				const words = section.title.split(' ');
				// this is a tolerance of 3 - should probably loop, decreasing num Words
				// until finding a match, and display its confidence level.
				return line.includes(words[0]) && line.includes(words[1]) && line.includes(words[2]);
			})
		}
		bodyIndexes.set(section.number, index);
		if (index) console.log(`${section.number} begins at line ${index}`);
	})
	console.log("Body Indexes: ", bodyIndexes);
	addSectionBodies(sections, bodyIndexes, array);
}

function addSectionBodies(sections, bodyIndexes, array) {
	sections.forEach(section => {
		const startIndex = bodyIndexes.get(section.number);
		const endIndex = bodyIndexes.get(section.number + 1);
		if (endIndex) {
			console.log(`Body for section ${section.number} goes from ${startIndex} to ${endIndex}`);
			section.body = array.slice(startIndex, endIndex);
		} else {
			console.log(`Body for section ${section.number} goes from ${startIndex} to end of document.`);
			section.body = array.slice(startIndex);
		}
	})
}

// This function is for when a non-space character precedes a section number
function cleanupSectionNumber(word, sectionNumLength) {
	return word.substring(word.length - sectionNumLength);
}

function removeEmptyLines(array) {
	const filteredArray = array.filter(element => {
		return element.trim().length > 0;
	})
	return filteredArray;
}

function determineDocMetaData(array) {
	const index = array.findIndex(line => {
		return line.startsWith("No. ");
	})
	console.log("Data:", array[index]);
	array.splice(0, index);
	const dataLine = array.shift();
	console.log(dataLine);
	// find journalNum: "No. 43"
	// find date
	const words = dataLine.split(' ');
	const preNum = words.shift();
	const journalNum = removeLastCharacter(words.shift());
	const day = removeLastCharacter(words.shift());
	const date = words.shift();
	const month = words.shift();
	const year = words.shift();
	const metadata = { preNum, journalNum, day, date, month, year };
	console.log(metadata);
	return metadata;
}

function removeLastCharacter(string) {
	return string.slice(0, string.length - 1);
}

function checkIsHeader(line, metadata) {
	const { preNum, journalNum, day, date, month, year } = metadata;
	return line.includes(preNum) && line.includes(journalNum) && line.includes(date) && line.includes(month) && line.includes(year)
}