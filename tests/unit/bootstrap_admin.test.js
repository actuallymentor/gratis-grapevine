import assert from 'node:assert/strict'
import test from 'node:test'

import { build_bootstrap_sql } from '../../scripts/bootstrap_admin.js'

test( `builds safe bootstrap SQL for a normalized email`, () => {
    const sql = build_bootstrap_sql( `Ada.O'Neil@Example.COM` )

    assert.match( sql, /status = 'accepted'/ )
    assert.match( sql, /role = 'admin'/ )
    assert.match( sql, /ada\.o''neil@example\.com/ )
    assert.match( sql, /NOT EXISTS/ )
} )
