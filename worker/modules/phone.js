/**
 * Normalizes a WhatsApp telephone value for storage and wa.me links.
 * @param {String} raw_value - Submitted phone value
 * @returns {Object} Display and digits values
 */
export function normalize_whatsapp_telephone( raw_value = `` ) {

    const trimmed = `${ raw_value }`.trim()
    const without_extension = trimmed.replace( /(?:ext|extension|x)\.?\s*\d+$/i, `` ).trim()
    const digits = without_extension.replace( /\D/g, `` )
    const international_digits = digits.startsWith( `00` ) ? digits.slice( 2 ) : digits
    const display = without_extension.startsWith( `+` )
        ? `+${ international_digits }`
        : without_extension || international_digits

    return {
        whatsapp_telephone: display,
        whatsapp_telephone_digits: international_digits,
    }
}

/**
 * Returns true when a submitted phone value is minimally usable.
 * @param {String} raw_value - Submitted phone value
 * @returns {Boolean} True when valid enough for MVP storage
 */
export function has_usable_phone( raw_value = `` ) {

    const { whatsapp_telephone_digits } = normalize_whatsapp_telephone( raw_value )
    return whatsapp_telephone_digits.length >= 8 && whatsapp_telephone_digits.length <= 15
}
