import { expect, test } from '@playwright/test'

const accepted_user = {
    id: `user_1`,
    name: `Ada`,
    email: `ada@example.test`,
    status: `accepted`,
    role: `member`,
    hub_id: `hub_amsterdam`,
    hub_name: `Amsterdam`,
}

test( `shows auth immediately for anonymous visitors`, async ( { page } ) => {
    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, user: null } ),
    } ) )

    await page.goto( `/` )

    await expect( page.getByRole( `heading`, { name: `Gratis Grapevine` } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Signup` } ) ).toBeVisible()
} )

test( `gates blocked accounts to review state`, async ( { page } ) => {
    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            user: { ...accepted_user, status: `blocked`, review_message: `Contact an admin.` },
        } ),
    } ) )

    await page.goto( `/` )

    await expect( page.getByRole( `heading`, { name: `Your account is not currently active.` } ) ).toBeVisible()
    await expect( page.getByText( `Contact an admin.` ) ).toBeVisible()
} )

test( `accepted members land on latest Grapevine`, async ( { page } ) => {
    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, user: accepted_user } ),
    } ) )
    await page.route( `**/api/grapevine/latest`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            update: {
                id: `update_1`,
                period_start: `2026-06-01`,
                period_end: `2026-06-07`,
                source_message_count: 4,
                model: `openai/gpt-4.1-mini`,
                summary_markdown: `## Amsterdam\nPeople are planning a shared dinner.`,
            },
        } ),
    } ) )

    await page.goto( `/` )

    await expect( page.getByRole( `heading`, { name: `Latest Grapevine` } ) ).toBeVisible()
    await expect( page.getByText( `People are planning a shared dinner.` ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Record update` } ) ).toBeVisible()
} )
