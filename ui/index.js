var html = require('choo/html')
var raw = require('choo/html/raw')
var css = require('sheetify')
var choo = require('choo')
var drop = require('drag-and-drop-files')
var fileReaderStream = require('filereader-stream')
var concat = require('secure-concat')
var raf = require('random-access-file-reader')
var tree = require('..').tree
var ballot = require('..').ballot
var print = require('print-flat-tree')
var sodium = require('sodium-universal')

css('tachyons')

var app = choo()
if (process.env.NODE_ENV !== 'production') {
  app.use(require('choo-devtools')())
} else {
  app.use(require('choo-service-worker')())
}

function dataFiles (files, cb) {
  var jsons = files.filter(f => f.name.endsWith('.json'))
  var result = {}

  loop()

  function loop () {
    var next = jsons.pop()
    if (!next) return cb(result)

    raf(next).read(0, 20, function (err, buf) {
      if (err) return loop()
      console.log(buf.toString())
      if (buf.toString().indexOf('"type":"ballot"') > -1) result.ballot = next
      else result.tree = next

      console.log(result)
      loop()
    })
  }
}

app.use(function (state, emitter) {
  if (global.document == null) return

  drop(global.document.body, function (files) {
    dataFiles(files, function (jsonFiles) {
      var pubs = files.reduce(function (f, e) {
        if (e.name.endsWith('.pub')) return e
        return f
      }, null)

      var secs = files.reduce(function (f, e) {
        if (e.name.endsWith('.sec')) return e
        return f
      }, null)

      if (jsonFiles.tree) {
        state.tree = tree(raf(jsonFiles.tree))
        emitter.emit('render')
      }

      // These next two are a hack, since antani.ballot needs to have a
      // a antani.tree also, but we don't want the user to have to drop files in
      // a specific order
      if (jsonFiles.ballot) {
        state.ballotRaf = raf(jsonFiles.ballot)
      }

      console.log(!!state.tree, !!state.ballotRaf, state.tree && state.ballotRaf)
      if (state.tree && state.ballotRaf) {
        state.ballot = ballot(state.ballotRaf, state.tree)
      }

      if (pubs) {
        fileReaderStream(pubs).pipe(concat(function (err, contents) {
          if (err) return console.error(err)

          state.pubs = contents.toString().trim().split('\n').map(s => s.trim())
          emitter.emit('render')
        }))
      }

      if (secs) {
        fileReaderStream(secs).pipe(concat(function (err, contents) {
          if (err) return console.error(err)

          state.secs = contents.toString().trim().split('\n').map(s => s.trim())
          emitter.emit('render')
        }))
      }
    })
  })
})

app.route('/', render)
app.route('/c0e02rV7eJoZEKQq57-YhwEp55vm1NdeRatOZ8VJgv8', render)
app.route('/*', render)

function render (state, emit) {
  var items = []

  if (state.tree) {
    items.push(panel({
      title: 'Root',
      description: html`<span>Retrieve the root node of the Merkle tree. This will contain the total balance of all accounts, which you can cross-check with public records</span>`,
      label: 'Retrieve',
      data: JSON.stringify(state.root, null, 2),
      cb: function () {
        state.tree.root(function (err, r) {
          if (err) return console.error(err)

          state.root = r
          emit('render')
        })
        return false
      }
    }))
  }

  if (state.tree && state.pubs) {
    items.push(panel({
      title: 'Bucket',
      description: html`<span>Retrieve balance data for all public keys in <code>keys.pub</code></span>`,
      label: 'Retrieve',
      data: JSON.stringify(state.buckets, null, 2),
      cb: function () {
        var buckets = []
        var missing = state.pubs.length
        state.pubs.map(function (pub, i) {
          state.tree.bucket(pub, function (err, b) {
            if (missing === 0) return

            if (err) {
              missing = 0
              return console.error(err)
            }

            missing--
            buckets[i] = b

            if (missing === 0) {
              state.buckets = buckets
              emit('render')
            }
          })
        })
        return false
      }
    }))
    items.push(panel({
      title: 'Proof',
      description: html`<span>
        Retrieve all required nodes to construct a full balance proof, that
        verifies <code>root</code> from the public keys in <code>keys.pub</code>.
        Yellow nodes are leaves, cyan nodes are peaks and the green node is the
        root. The green node verifieds the cyan nodes, which verifies the trees
        they're connected to, ultimately verifying the yellow leaf nodes.
      </span>`,
      label: 'Verify',
      data: state.proof,
      cb: function () {
        var nodes = new Set()
        var missing = state.pubs.length
        state.pubs.map(function (pub, i) {
          state.tree.proof(pub, function (err, proof) {
            if (missing === 0) return

            if (err) {
              missing = 0
              return console.error(err)
            }

            missing--
            proof.nodes.forEach(n => nodes.add(n.index))
            proof.peaks.forEach(n => nodes.add(n.index))
            nodes.add(proof.root.index)

            if (missing === 0) {
              state.proof = html`<span>
              ${raw(print(Array.from(nodes.values()), {color: function (str, color) {
                return `<span style="color: ${color.replace('green', 'lime')}">${str}</span>`
              }}))}
              </span>`
              emit('render')
            }
          })
        })
        return false
      }
    }))
  }

  if (state.tree && state.pubs && state.secs) {
    function oncandidateinput () {
      state.currentCandidate = this.value
    }

    items.push(panel({
      title: 'Voting',
      description: html`<span>
        Sign a vote with each of your secret keys, which can be send to
        <code>antani-ballot</code><br>
        <input class="pa2 input-reset ba bg-transparent w-100" oninput=${oncandidateinput} value="${state.currentCandidate || ''}" placeholder="Option 1" name="candidate"/>
      </span>`,
      label: 'Sign',
      data: JSON.stringify(state.votes, null, 2),
      cb: function () {
        if (state.currentCandidate == false) return false

        var cand = state.currentCandidate // avoid concurrency issue
        var votes = []
        var missing = state.pubs.length
        state.pubs.map(function (pub, i) {
          state.tree.vote(pub, state.secs[i], cand, function (err, vote) {
            if (missing === 0) return

            if (err) {
              missing = 0
              return console.error(err)
            }

            missing--
            votes[i] = vote

            if (missing === 0) {
              state.votes = votes
              emit('render')
            }
          })
        })
        return false
      }
    }))
  }

  if (state.ballot) {
    items.push(panel({
      title: 'Tally Votes',
      description: html`<span>Tally all the votes in the current ballot</span>`,
      label: 'Tally',
      data: JSON.stringify(state.tally, null, 2),
      cb: function () {
        state.ballot.tally(function (err, res) {
          if (err) return console.error(err)

          state.tally = res
          emit('render')
        })

        return false
      }
    }))
  }

  if (state.secs && state.pubs) {
    function onOwnershipMessageInput () {
      state.ownershipMessage = this.value
    }

    items.push(panel({
      title: 'Ownership',
      description: html`<span>
        Sign a message with each of your secret keys, to prove ownership of your
        public keys<br>
        <input class="pa2 input-reset ba bg-transparent w-100" oninput=${onOwnershipMessageInput} value="${state.ownershipMessage || ''}" placeholder="proof of ownership message" name="message"/>
      </span>`,
      label: 'Sign',
      data: JSON.stringify({
        message: state.ownershipMessage,
        signatures: state.signatures
      }, null, 2),
      cb: function () {
        if (state.ownershipMessage == false) return false

        if (state.secs.length !== state.pubs.length) {
          return alert('Mismatch pubs.size vs secs.size')
        }

        var buckets = []
        for (var i = 0; i < state.secs.length; i++) {
          buckets.push({ key: state.pubs[i], secretKey: state.secs[i] })
        }

        state.tree.signMessage(buckets, state.ownershipMessage, function(err, res) {
          if (err) {
            return alert(err)
          }
          state.signatures = res.signatures
          emit('render')
        })
        return false
      }
    }))
  }

  if (state.pubs) {
    function onVerifyOwnershipMessageInput () {
      state.verifyOwnershipMessage = this.value
    }

    items.push(panel({
      title: 'Verify Ownership',
      description: html`<span>
        Verify a message using the owner's public keys<br>
        <input class="pa2 input-reset ba bg-transparent w-100" oninput=${onVerifyOwnershipMessageInput} value="${state.verifyOwnershipMessage || ''}" placeholder="validate ownership of a message" name="message"/>
      </span>`,
      label: 'Verify',
      data: JSON.stringify({
        verify: state.verifiedOwnership
      }, null, 2),
      cb: function () {
        if (state.verifyOwnershipMessage == false) return false
        var verifyOwnershipMessage = null
        try { verifyOwnershipMessage = JSON.parse(state.verifyOwnershipMessage) } catch(err) {
          return alert('Invalid Message')
        }
         
        state.tree.verifyMessage(state.pubs, verifyOwnershipMessage, function(err) {
          if (err) {
            return alert(err)
          }
          state.verifiedOwnership = { valid: !!!err }
          emit('render')
        })
        return false
      }
    }))

  }

  return html`<body style="min-height: 100vh;" class="sans-serif">
    <article class="ph3 ph5-ns pv5">
      <header class="w-50-ns pr4-ns">
        <h1 class="mb3 mt0 lh-title">Antani</h1>
        <p class="f6 ttu tracked gray measure">Proof\u00A0of\u00A0Solvency, Custody and Delegated\u00A0Proof\u00A0of\u00A0Vote</p>
      </header>
      <div class="w-50-ns pr4-ns">
        <h4>Loaded files</h4>
        <p>Please drag and drop the following files to activate the app</p>
        <dl class="f6 lh-title mv2">
          <dt class="dib b"><code>balances.json</code>:</dt>
          ${state.tree ? html`<dd class="dib ml1 dark-green">✔︎</dd>` : html`<dd class="dib ml1 dark-red">✗</dd>`}
          <dd class="ml3 mt1 gray">File containing the merkle tree of all account balances</dd>
        </dl>
        <dl class="f6 lh-title mv2">
          <dt class="dib b"><code>keys.pub</code>:</dt>
          ${state.pubs ? html`<dd class="dib ml1 dark-green">✔︎</dd>` : html`<dd class="dib ml1 dark-red">✗</dd>`}
          <dd class="ml3 mt1 gray">List of public keys you wish to verify</dd>
        </dl>
        <dl class="f6 lh-title mv2">
          <dt class="dib b"><code>keys.sec</code>:</dt>
          ${state.secs ? html`<dd class="dib ml1 dark-green">✔︎</dd>` : html`<dd class="dib ml1 dark-red">✗</dd>`}
          <dd class="ml3 mt1 gray">List of secret keys to prove ownership or cast vote</dd>
        </dl>
        <dl class="f6 lh-title mv2">
          <dt class="dib b"><code>ballot.json</code>:</dt>
          ${state.ballot ? html`<dd class="dib ml1 dark-green">✔︎</dd>` : html`<dd class="dib ml1 dark-red">✗</dd>`}
          <dd class="ml3 mt1 gray">File containing a ballot list of cast votes, so it can be verified and tallied. Required <code>balances.json</code> to be present</dd>
        </dl>
      </div>
      ${items}
    </article>
  </body>`
}

var panelCss = css`
  :host {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
  }

  :host h2 {
    width: 100%;
  }

  :host div {
    flex: 1 1;
  }

  :host pre {
    flex: 2 2;
  }
`
function panel (obj) {
  return html`<div class="${panelCss}">
    <h2>${obj.title}</h2>
    <form class="mr4" onsubmit=${obj.cb}>
      <p class="lh-copy measure mt4 mt0-ns">${obj.description}</p>
      <button onclick=${obj.cb} class="f6 no-underline dib v-mid bg-blue white ba b--blue ph3 pv2 mb3 pointer dim">${obj.label}</button>
    </form>
    <pre class="overflow-scroll mv0 bg-dark-gray b--black ba near-white pa2">${obj.data}</pre>
  </div>`
}

module.exports = app.mount('body')
