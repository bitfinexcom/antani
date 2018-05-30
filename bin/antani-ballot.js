#!/usr/bin/env node
const antani = require('../')
const fs = require('fs')
const path = require('path')
const argv = require('minimist')(process.argv.slice(2), {

})

var cmd = argv._[0]

switch (cmd) {
  case 'init': return init(argv._[1])
  case 'finalize': return finalize(argv._[1], argv._[2], argv._[3])
  case 'cast': return cast(argv._[1], argv._[2], argv._[3], argv._[4])
  case 'tally': return tally(argv._[1], argv._[2], argv._[3])
  default:
    console.error(`Usage: antani-ballot <cmd> [options]

  antani-ballot init <key-pair>
  antani-ballot finalize <key-pair> <ballot-file> <tree-file>
  antani-ballot cast <key-pair> <ballot-file> <tree-file> <vote>
  antani-ballot tally <key-pair> <ballot-file> <tree-file>
`)
  process.exit(1)
}

function init (keyPath) {
  fs.writeFileSync(path.join(process.cwd(), keyPath), JSON.stringify(antani.ballot.keygen()))
}

function cast (keyPath, ballotPath, treePath, voteStr) {
  var t = antani.tree(path.join(process.cwd(), treePath))
  var keys = JSON.parse(fs.readFileSync(path.join(process.cwd(), keyPath), 'utf8'))
  var candidates = ['pindis', 'rød grød med fløde', 'koldskål']
  var b = antani.ballot(path.join(process.cwd(), ballotPath), keys, t, candidates)

  var vote = JSON.parse(voteStr)

  b.push(vote, console.log)
}

function finalize (keyPath, ballotPath, treePath) {
  var t = antani.tree(path.join(process.cwd(), treePath))
  var keys = JSON.parse(fs.readFileSync(path.join(process.cwd(), keyPath), 'utf8'))
  var candidates = ['pindis', 'rød grød med fløde', 'koldskål']
  var b = antani.ballot(path.join(process.cwd(), ballotPath), keys, t, candidates)

  b.finalize(console.log)
}

function tally (keyPath, ballotPath, treePath) {
  var t = antani.tree(path.join(process.cwd(), treePath))
  var keys = JSON.parse(fs.readFileSync(path.join(process.cwd(), keyPath), 'utf8'))
  var candidates = ['pindis', 'rød grød med fløde', 'koldskål']
  var b = antani.ballot(path.join(process.cwd(), ballotPath), keys, t, candidates)

  b.tally(console.log)
}
