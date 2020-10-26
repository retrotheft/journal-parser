const fs = require('fs');
const pdfParse = require('pdf-parse');

console.log("Welcome to the Senate Journal PDF Parser");

const journal = '54';

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
	const filteredArray = removeEmptyLines(array);
	appendBodies(filteredArray, sections);
	fs.writeFileSync(`${dir}/lines.json`, JSON.stringify(filteredArray));
	fs.writeFileSync(`${dir}/sections.json`, JSON.stringify(sections));
}

// this should receive the post-extractTOC array of lines
function createSections(lines) {
	const array = [];
	lines.forEach(line => {
		const words = line.trim().split(' ');
		const number = parseInt(words.shift());
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
// needs to handle missing whole section case in journal (54)
function extractSectionNumber(line, currentSection, foundSectionNum) {
	const words = line.split(' ');
	let index = words.findIndex(word => word == currentSection);
	if (index === -1) { // check end of line
		let word = words.pop();
		const length = currentSection.toString().length;
		console.log(word, word.length, length);
		const stringToCheck = word.substring(word.length - length);
		console.log("String Check:", stringToCheck);
		if (stringToCheck == currentSection) {
			word = word.substring(0, word.length - length);
			words.push(word);
			words.unshift(`${stringToCheck} `);
			index = words.findIndex(word => word == currentSection);
		}
	}
	console.log(line);
	if (index > -1) {
		if (index === words.length - 1) {
			foundSectionNum = words.pop();
		}	else {
			foundSectionNum = words.shift();
		}
		// need to check for weird 's-' edge cases on some lines
		console.log("Checking: ", currentSection);
		
		// foundSectionNum = parseInt(words.splice(index, 1)[0]);
		if (isNaN(foundSectionNum)) {
			console.log("Not a number!");
			foundSectionNum = words.shift();
		}
		console.log("Found: ", foundSectionNum);
	} else { // handles section number being preceded by a non-space character
		foundSectionNum = words.shift();
		if (!isNaN(foundSectionNum)) { // check if a section number was missing
			currentSection = foundSectionNum;
			console.log("Next Section Number:", currentSection);
		} else { // returns null when line is an in-betweener
			if (foundSectionNum !== currentSection) foundSectionNum = null;
		}
	}
	const string = words.join(' ').trim();
	console.log("Found Section Num: ", foundSectionNum);
	return { foundSectionNum, line: string, currentSection };
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

// appendBodies needs to remove body from main array when adding

function appendBodies(array, sections) {
	const bodyIndexes = new Map();
	let lastIndex = -1;
	sections.forEach(section => {
		console.log(`Finding section ${section.number} - ${section.title}`);
		if (!bodyIndexes.has(section.number)) {
			let index;
			index = array.findIndex((line, lineIndex) => {
				// prevent matches being found before last match
				if (lineIndex > lastIndex) {
					// first look for exact match - contains number and title
					let found = (line.includes(section.number) && line.includes(section.title));
					if (found) return found;
					// if failed, look for a match with number and decreasing number of words 5 down
					found = findNearMatch(line, section);
					if (found) return found;
					return line === section.number.toString(); // last ditch effort - section Number is entire line
				}
			})
			if (index === -1) {
				console.log(`No Exact or Near Match found for ${section.number} - ${section.title}`);
			}
			// ensure no match is found before previous section
			bodyIndexes.set(section.number, index);
			lastIndex = index;
			if (index) console.log(`${section.number} begins at line ${index}`);
		}
	})
	console.log("Body Indexes: ", bodyIndexes);
	addSectionBodies(sections, bodyIndexes, array);
}

function findNearMatch(line, section) {
	let tolerance = 5;
	// first pass through and get all lines containing section number
	if (line.trim().startsWith(section.number) || line.trim().endsWith(section.number)) {
		console.log("Found line containing", section.number);
		console.log(line);
		// try to match first five words in title (not all titles have five words)
		let titleWords = section.title.split(' ');
		titleWords.splice(tolerance);
		// console.log("Looking for these words:", titleWords);
		let lineWords = line.split(' ');
		// console.log("in this set of words:", lineWords);
		// reduce number of words to match until match is found
		while (titleWords.length > 0) {
			const wordMatches = new Set();
			titleWords.forEach(word => {
				wordMatches.add(lineWords.includes(word));
			})
			if (!wordMatches.has(false)) {
				return true;
			}
			titleWords.pop();
		}
	}
	return false;
}

function addSectionBodies(sections, bodyIndexes, array) {
	sections.forEach(section => {
		const startIndex = bodyIndexes.get(section.number);
		// this needs to find next number
		const endIndex = findNextKeyInMap(bodyIndexes, section.number);
		console.log(endIndex);
		// const endIndex = bodyIndexes.get(section.number + 1);
		if (endIndex) {
			console.log(`Body for section ${section.number} goes from ${startIndex} to ${endIndex}`);
			section.body = array.slice(startIndex, endIndex);
		} else {
			console.log(`Body for section ${section.number} goes from ${startIndex} to end of document.`);
			section.body = array.slice(startIndex);
		}
	})
}

function findNextKeyInMap(map, key) {
	const remaining = map.size + 2; // one for zero-index, one for keys starting at 1. (I think)
	for (let i = key + 1; i < remaining; i++) {
		if (map.has(i)) return map.get(i); 
	}
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
	const words = dataLine.trim().split(' ');
	const preNum = words.shift();
	const journalNum = removeLastCharacter(words.shift());
	const day = removeLastCharacter(words.shift());
	const date = words.shift();
	const month = words.shift();
	const year = words.pop(); // pops due to some metadata lines containing two dates
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