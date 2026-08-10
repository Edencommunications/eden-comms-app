// Regression tests: a `comm:<id>` read-state stamp synced from ANOTHER device
// must clear this device's Communities nav badge — and stale stamps must
// never roll newer local read state backwards.
// Run with: node --test tests/comm-seen-merge.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeRemoteSeen, isSeen } from '../src/lib/seenMerge.js'

const CID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const DBA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

test('remote comm: stamp clears an unread message without visiting Communities', () => {
  const msgAt = '2026-08-10T12:00:00.000Z'
  const local = {} // this device never opened the community
  assert.equal(isSeen(local, CID, msgAt), false, 'starts unread')
  // Another device read the community after the message arrived
  const remote = { [`comm:${CID}`]: Date.parse('2026-08-10T12:05:00.000Z') }
  const { map, changed } = mergeRemoteSeen(local, remote, 'comm:')
  assert.equal(changed, true)
  assert.equal(isSeen(map, CID, msgAt), true, 'badge clears after merge')
})

test('stale remote stamp never rolls newer local read state back', () => {
  const local = { [CID]: '2026-08-10T12:10:00.000Z' }
  const remote = { [`comm:${CID}`]: Date.parse('2026-08-10T11:00:00.000Z') }
  const { map, changed } = mergeRemoteSeen(local, remote, 'comm:')
  assert.equal(changed, false)
  assert.equal(map[CID], '2026-08-10T12:10:00.000Z')
})

test('only keys under the requested prefix are merged', () => {
  const remote = {
    [`comm:${CID}`]: Date.parse('2026-08-10T12:00:00.000Z'),
    [`dba:${DBA}:${CID}`]: Date.parse('2026-08-10T13:00:00.000Z'),
    general: Date.parse('2026-08-10T14:00:00.000Z'),
  }
  const comm = mergeRemoteSeen({}, remote, 'comm:')
  assert.deepEqual(Object.keys(comm.map), [CID])
  assert.equal(comm.map[CID], '2026-08-10T12:00:00.000Z')
  const dba = mergeRemoteSeen({}, remote, `dba:${DBA}:`)
  assert.deepEqual(Object.keys(dba.map), [CID])
  assert.equal(dba.map[CID], '2026-08-10T13:00:00.000Z')
})

test('garbage remote values are ignored', () => {
  const remote = { [`comm:${CID}`]: 'soon', 'comm:': 123, [`comm:${CID}2`]: -5, [`comm:${CID}3`]: NaN }
  const { map, changed } = mergeRemoteSeen({}, remote, 'comm:')
  assert.equal(changed, false)
  assert.deepEqual(map, {})
})
