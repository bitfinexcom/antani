const { tree } = require('./')
const from = require('from2')

const [ , , cmd, arg ] = process.argv

if (cmd === 'write') write()
else if (cmd === 'root') root()
else if (cmd === 'node') node(arg)
else if (cmd === 'bucket') bucket(arg)
else if (cmd === 'proof') proof(arg)

function root () {
  tree('balances.json').root(console.log)
}

function node (index) {
  tree('balances.json').node(parseInt(index, 10), console.log)
}

function bucket (key) {
  tree('balances.json').bucket(key, console.log)
}

function proof (key) {
  tree('balances.json').proof(key, console.log)
}

function write () {
  var missing = 100000

  const buckets = from.obj(function (size, cb) {
    if (!missing--) return cb(null, null)

    var keys = tree.keygen()

    cb(null, {
      balance: Math.round(Math.random() * 10000),
      key: keys.key,
      secretKey: keys.secretKey
    })
  })

  buckets
    .pipe(tree.createWriteStream('balances.json'))
    .on('finish', function () {
      console.log('tree file written to ./balances.json')
    })
}
