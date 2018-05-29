#!/usr/bin/env node
const { tree } = require('../')
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
  case 'vote': return vote(argv._[1], argv._[2], argv._[3], argv._[4])
  default:
    console.error(`Usage: antani <cmd> <file> [options]

  antani write <file> <input-file>
  antani root <file>
  antani node <file> <index>
  antani bucket <file> <public-key>
  antani proof <file> <public-key>
  antani vote <file> <public-key> <secret-key> <vote>
`)
  process.exit(1)
}

function root (treePath) {
  tree(path.join(process.cwd(), treePath)).root(console.log)
}

function node (treePath, index) {
  tree(path.join(process.cwd(), treePath)).node(parseInt(index, 10), console.log)
}

function bucket (treePath, key) {
  tree(path.join(process.cwd(), treePath)).bucket(key, console.log)
}

function proof (treePath, key) {
  tree(path.join(process.cwd(), treePath)).proof(key, console.log)
}

function vote (treePath, key, sk, vote) {
  tree(path.join(process.cwd(), treePath)).vote(key, sk, vote, console.log)
}

function write (treePath, inputPath) {
  var inputStream = process.stdin
  if (inputPath !== '-') inputStream = fs.createReadStream(path.join(process.cwd(), inputPath))

  const secretKeysPath = path.join(process.cwd(), 'keys.sec')
  const publicKeysPath = path.join(process.cwd(), 'keys.pub')

  const secretKeysStream = fs.createWriteStream(secretKeysPath)
  const publicKeysStream = fs.createWriteStream(publicKeysPath)

  const bucketing = through.obj(function (account, _, cb) {
    const [accno, balance] = account.split('\t')
    const buckets = tree.bucket(parseInt(balance, 10))

    for (var i = 0; i < buckets.length; i++) {
      var keys = tree.keygen()

      // for simplicity we ignore backpressure here, the tree is the bottleneck anyway
      secretKeysStream.write(`${accno}\t${keys.secretKey}\r\n`)
      publicKeysStream.write(`${accno}\t${keys.key}\r\n`)

      this.push({
        balance: buckets[i],
        key: keys.key,
        secretKey: keys.secretKey
      })
    }

    cb()
  })

  pump(inputStream, split(), bucketing, tree.createWriteStream(treePath), function (err) {
    secretKeysStream.end()
    publicKeysStream.end()

    if (err) {
      console.error(err)
      process.exit(1)
    }

    console.log('tree file written to ' + treePath)
  })
}
