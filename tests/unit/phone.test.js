import assert from 'node:assert/strict'
import test from 'node:test'

import { has_usable_phone, normalize_whatsapp_telephone } from '../../worker/modules/phone.js'

test( `normalizes WhatsApp numbers for display and wa.me links`, () => {
    const normalized = normalize_whatsapp_telephone( `+31 6 12 34 56 78` )

    assert.equal( normalized.whatsapp_telephone, `+31612345678` )
    assert.equal( normalized.whatsapp_telephone_digits, `31612345678` )
} )

test( `accepts only minimally usable phone numbers`, () => {
    assert.equal( has_usable_phone( `+31612345678` ), true )
    assert.equal( has_usable_phone( `123` ), false )
} )
