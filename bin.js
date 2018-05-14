#!/usr/bin/env node --harmony-bigint
const tree = require('./')
const fs = require('fs')
const path = require('path')
const through = require('through2')
const split = require('split2')
const pump = require('pump')
const argv = require('minimist')(process.argv.slice(2), {

})

var cmd = argv._[0]

switch (cmd) {
  case 'write': return write(argv._[1], argv._[2])
  case 'root': return root(argv._[1])
  case 'node': return node(argv._[1], argv._[2])
  case 'bucket': return bucket(argv._[1], argv._[2])
  case 'proof': return proof(argv._[1], argv._[2])
  default:
    console.error(`Usage: antani <cmd> <file> [options]

  antani write <file> <input-file>
  antani root <file>
  antani node <file> <index>
  antani bucket <file> <public-key>
  antani proof <file> <public-key>
`)
  process.exit(1)
}

function root (treePath) {
  tree(treePath).root(console.log)
}

function node (treePath, index) {
  tree(treePath).node(parseInt(index, 10), console.log)
}

function bucket (treePath, key) {
  tree(treePath).bucket(key, console.log)
}

function proof (treePath, key) {
  tree(treePath).proof(key, console.log)
}

function write (treePath, inputPath) {
  var inputStream = process.stdin
  if (inputPath !== '-') inputStream = fs.createReadStream(path.join(process.cwd(), inputPath))

  const decommitmentsPath = path.join(process.cwd(), 'keys.sec')
  const decommitmentsStream = fs.createWriteStream(decommitmentsPath)

  const commit = through.obj(function (account, _, cb) {
    const [accno, balance] = account.split('\t')

    cb(null, {
      balance: parseInt(balance, 10),
      key: accno,
    })
  })

  var ts =  tree.createWriteStream(treePath)

  ts.decommitments.pipe(through.obj(function (ch, _, cb) {
    cb(null, ch.key + '\t' + ch.decommitment + '\n')
  })).pipe(decommitmentsStream)

  pump(inputStream, split(), commit, ts, function (err) {
    if (err) {
      console.error(err)
      process.exit(1)
    }

    console.log('tree file written to ./balances.json')
  })
}
