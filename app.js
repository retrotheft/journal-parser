const fs = require('fs');
const pdfParse = require('pdf-parse');

console.log("Welcome to PDF Parser");

const journal = '42';

const pdfFile = fs.readFileSync(`./journals/${journal}.pdf`);

const dir = `./output/${journal}`;

if (!fs.existsSync(dir)){
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
	const buffer = [];
	const sectionLines = [];
	let currentSection = 1;
	let sectionNum = null;
	contents.forEach((line, index) => {
		if (periodIndexes.has(index)) {
			console.log(`Parsing section ${currentSection} - ${line}`);
			let string = '';
			// if line has 4 dots
			while (buffer.length > 0) {
				string += buffer.shift()
			}
			console.log("Buffer emptied. String:");
			console.log(string);
			string += line;
			// work out if section Number is at start or end of line
			if (line.startsWith(currentSection)) {
				sectionNum = line.slice(0, currentSection.toString().length);
			}
			if (sectionNum) {
				console.log(`Appending section number ${sectionNum} to line`);
				string += sectionNum;
				console.log(string);
				sectionNum = null;
			}
			sectionLines.push(string);
			buffer.length = 0;
			currentSection++;
		} else {
			if (currentSection > 0) {
				console.log(`Performing cleanup on section ${currentSection}`);
				const numLength = currentSection.toString().length;
				console.log(`Section number is ${numLength} digits long`);
				// extract section number from first line
				if (buffer.length === 0) {
					const sliceIndex = line.length - numLength;
					console.log(`Slicing ${numLength} digits from ${sliceIndex}`);
					sectionNum = line.substring(sliceIndex);
					line = line.substring(0, sliceIndex);
					console.log(`Section Number is ${sectionNum}`);
				}
				buffer.push(line);
				// console.log(buffer);
			}
		}
	})
	// Need to find the indexes again since some strings have been lengthened
	periodIndexes = findPeriodIndexes(sectionLines);
	// periodIndexes.forEach((cursor, index) => {

	// })
	const mappedArray = sectionLines.map(str => {
		return str.replace(/[.]/g, ""); // this might remove periods we don't want to take
	})
	console.log(mappedArray);
	const sectionPages = mappedArray.map((str, index) => {
		const cursorStart = periodIndexes.get(index);
		const title = str.substring(0, cursorStart).trim();
		const metadata = str.substring(cursorStart).trim();
		const array = metadata.split(' ');
		const page = array[0];
		const number = array[1] ? parseInt(array[1]) : null;
		return { title, page, number };
	})
	const filteredArray = removeEmptyLines(array);
	appendBodies(filteredArray, sectionPages);
	fs.writeFileSync(`./output/${journal}/lines.json`, JSON.stringify(filteredArray));
	fs.writeFileSync(`./output/${journal}/sections.json`, JSON.stringify(sectionPages));
}

function extractTOC(text) {
	// find indexOf the first and last lines that contain 4 periods
	// run through each line, creating a new element for each 4 period line
	// if no 4 dots, save that line in a buffer to be added to the beginning
	// of the next line.
	// In this case the last 2 digits of the first line are the section number
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
	console.log(bodyIndexes);
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