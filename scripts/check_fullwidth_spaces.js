#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
global.__base = path.join(__dirname, '../blog')

var program
try {
  program = require('commander')
} catch (e) {
  program = require(`${__base}/node_modules/commander`)
}

function commaSeparatedList (value, dummyPrevious) {
  return value.split(',')
}

program
  .option('-d, --directory [directory...]', 'Directory to be explored', commaSeparatedList)
  .option('-i, --input <input>', 'Input file', commaSeparatedList)
  .option('-f, --format <format>', 'File format', '.md')
  .parse(process.argv)

var entryChecks = Array.from(program.directory).every((entry) => {
  entry = path.resolve(entry)
  if (!fs.existsSync(entry)) {
    console.warn(`Directory not exist: ${entry}`)
    return false
  }
  if (!fs.lstatSync(entry).isDirectory()) {
    console.warn(`Given entry is not a directory: ${entry}`)
    return false
  }
  return true
})

if (!entryChecks) { process.exit(1) }

Array.from(program.directory).map((entry) => {
  fs.readdirSync(entry).forEach(file => {
    var fname = path.resolve(path.join(entry, file))
    fs.readFile(fname, 'utf8', (err, data) => {
      if (err) { throw err }
      if (data.includes('\u3000')) {
        checkFailed = true
        console.log(`Found full-width space in: ${fname}`)
      }
    })
  })
})
