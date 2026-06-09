import styled from 'styled-components'

const FieldWrap = styled.label`
    display: grid;
    min-width: 0;
    gap: 0.4rem;
    color: var(--ink);
    font-weight: 700;
`

const HelpText = styled.span`
    color: var(--muted);
    font-size: 0.9rem;
    font-weight: 500;
`

const input_styles = `
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 48px;
    padding: 0.72rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    background: var(--surface-raised);
    outline: none;
    overflow-wrap: anywhere;

    &:focus {
        border-color: var(--accent-dark);
        box-shadow: 0 0 0 3px var(--focus-ring);
    }

    &:focus-visible {
        outline: none;
    }
`

export const Input = styled.input`${ input_styles }`
export const Select = styled.select`${ input_styles }`
export const Textarea = styled.textarea`
    ${ input_styles }
    min-height: 9rem;
    resize: vertical;
`

/**
 * Renders a labelled form field.
 * @param {Object} props - Field props
 * @returns {JSX.Element} Field wrapper
 */
export function Field( { label, help, children } ) {

    return <FieldWrap>
        <span>{ label }</span>
        { children }
        { help ? <HelpText>{ help }</HelpText> : null }
    </FieldWrap>
}
