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

const route_accepted_member = async page => {

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
                generated_at: `2026-06-08T07:00:00.000Z`,
                generation_kind: `scheduled`,
                source_message_count: 4,
                model: `openai/gpt-4.1-mini`,
                summary_markdown: `## Amsterdam\nPeople are planning a shared dinner.`,
            },
        } ),
    } ) )
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

test( `gates pending accounts to review state`, async ( { page } ) => {
    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            user: { ...accepted_user, status: `pending`, review_message: `We will review this soon.` },
        } ),
    } ) )

    await page.goto( `/` )

    await expect( page.getByRole( `heading`, { name: `Your account is being reviewed.` } ) ).toBeVisible()
    await expect( page.getByText( `We will review this soon.` ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Record update` } ) ).not.toBeVisible()
} )

test( `new members can sign up with password and land pending`, async ( { page } ) => {
    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, user: null } ),
    } ) )
    await page.route( `**/api/signup`, async route => {
        const body = route.request().postDataJSON()
        expect( body.email ).toBe( `new@example.test` )
        expect( body.password ).toBe( `verylongpassword` )

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                ok: true,
                user: {
                    ...accepted_user,
                    id: `new_user`,
                    name: body.name,
                    email: body.email,
                    status: `pending`,
                    role: `member`,
                    review_message: null,
                },
            } ),
        } )
    } )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Signup` } ).click()
    await page.getByLabel( `Name` ).fill( `New Member` )
    await page.getByLabel( `WhatsApp telephone` ).fill( `+31612345678` )
    await page.getByLabel( `Email` ).fill( `new@example.test` )
    await page.getByRole( `button`, { name: `Password` } ).click()
    await page.getByLabel( `Password` ).fill( `verylongpassword` )
    await page.getByRole( `button`, { name: `Create account` } ).click()

    await expect( page.getByRole( `heading`, { name: `Your account is being reviewed.` } ) ).toBeVisible()
} )

test( `accepted members land on latest Grapevine`, async ( { page } ) => {
    await route_accepted_member( page )
    await page.route( `**/api/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, messages: [] } ),
    } ) )

    await page.goto( `/` )

    await expect( page.getByRole( `heading`, { name: `Latest Grapevine` } ) ).toBeVisible()
    await expect( page.getByText( `People are planning a shared dinner.` ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Record update` } ) ).toBeVisible()
} )

test( `accepted members can submit a typed update`, async ( { page } ) => {
    await route_accepted_member( page )

    const messages = []

    await page.route( `**/api/messages`, async route => {
        if( route.request().method() === `POST` ) {
            const body = route.request().postDataJSON()
            messages.push( {
                id: `message_typed`,
                body: body.body,
                source: body.source,
                created_at: `2026-06-07T12:00:00.000Z`,
                updated_at: `2026-06-07T12:00:00.000Z`,
            } )

            return route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { ok: true, message: messages[ 0 ] } ),
            } )
        }

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { ok: true, messages } ),
        } )
    } )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Type update` } ).click()
    await page.getByRole( `textbox`, { name: `Update` } ).fill( `Typed Grapevine update.` )
    await page.getByRole( `button`, { name: `Submit update` } ).click()

    await expect( page.getByText( `Update submitted.` ) ).toBeVisible()
    await expect( page.getByText( `Typed Grapevine update.` ) ).toBeVisible()
} )

test( `accepted members can edit and delete their own updates`, async ( { page } ) => {
    await route_accepted_member( page )

    let message_body = `Original update text.`

    await page.route( `**/api/messages/message_1`, async route => {
        if( route.request().method() === `PATCH` ) {
            const body = route.request().postDataJSON()
            message_body = body.body

            return route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    ok: true,
                    message: {
                        id: `message_1`,
                        body: message_body,
                        source: `typed`,
                        created_at: `2026-06-07T12:00:00.000Z`,
                        updated_at: `2026-06-07T13:00:00.000Z`,
                    },
                } ),
            } )
        }

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { ok: true, deleted: true } ),
        } )
    } )

    await page.route( `**/api/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            messages: [
                {
                    id: `message_1`,
                    body: message_body,
                    source: `typed`,
                    created_at: `2026-06-07T12:00:00.000Z`,
                    updated_at: `2026-06-07T12:00:00.000Z`,
                },
            ],
        } ),
    } ) )

    await page.goto( `/` )

    await expect( page.getByRole( `heading`, { name: `Your updates` } ) ).toBeVisible()
    await expect( page.getByText( `Original update text.` ) ).toBeVisible()

    await page.getByRole( `button`, { name: `Edit` } ).click()
    await page.getByLabel( `Edit update` ).fill( `Edited update text.` )
    await page.getByRole( `button`, { name: `Save` } ).click()

    await expect( page.getByText( `Edited update text.` ) ).toBeVisible()

    await page.getByRole( `button`, { name: `Delete` } ).click()
    await page.getByRole( `dialog`, { name: `Delete update` } ).getByRole( `button`, { name: `Delete` } ).click()

    await expect( page.getByText( `Edited update text.` ) ).not.toBeVisible()
} )

test( `accepted members can adjust display settings`, async ( { page } ) => {
    await route_accepted_member( page )
    await page.route( `**/api/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, messages: [] } ),
    } ) )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Account and display settings` } ).click()
    await page.getByRole( `dialog`, { name: `Account` } ).getByRole( `button`, { name: `Large`, exact: true } ).click()

    await expect.poll( () => page.evaluate( () => getComputedStyle( document.body ).fontSize ) ).toBe( `17.92px` )
} )

test( `admins can approve pending members`, async ( { page } ) => {
    const admin_user = { ...accepted_user, role: `admin` }
    let status_update = null

    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, user: admin_user } ),
    } ) )
    await page.route( `**/api/admin/users`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            users: [
                {
                    id: `pending_1`,
                    name: `Pending Member`,
                    email: `pending@example.test`,
                    email_url: `mailto:pending@example.test`,
                    whatsapp_telephone: `+31612345678`,
                    whatsapp_url: `https://wa.me/31612345678`,
                    hub_id: `hub_amsterdam`,
                    hub_name: `Amsterdam`,
                    status: status_update?.status || `pending`,
                    role: `member`,
                    review_message: null,
                    created_at: `2026-06-07T12:00:00.000Z`,
                },
            ],
        } ),
    } ) )
    await page.route( `**/api/admin/users/pending_1/status`, async route => {
        status_update = route.request().postDataJSON()

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { ok: true, user: { id: `pending_1`, status: status_update.status } } ),
        } )
    } )
    await page.route( `**/api/admin/hubs`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, hubs: [ { id: `hub_amsterdam`, name: `Amsterdam` } ], requested_hubs: [] } ),
    } ) )
    await page.route( `**/api/admin/ai-requests`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, ai_requests: [], grapevine_updates: [] } ),
    } ) )
    await page.route( `**/api/admin/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, messages: [] } ),
    } ) )
    await page.route( `**/api/grapevine/latest`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, update: null } ),
    } ) )
    await page.route( `**/api/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, messages: [] } ),
    } ) )

    await page.goto( `/admin` )
    await expect( page.getByRole( `heading`, { name: `Admin` } ) ).toBeVisible()
    await page.getByRole( `button`, { name: `Approve` } ).click()

    await expect.poll( () => status_update?.status ).toBe( `accepted` )
} )

test( `accepted members can ask an open Grapevine question`, async ( { page } ) => {
    await route_accepted_member( page )
    await page.route( `**/api/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, messages: [] } ),
    } ) )
    await page.route( `**/api/hubs`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, hubs: [ { id: `hub_amsterdam`, name: `Amsterdam` } ] } ),
    } ) )
    await page.route( `**/api/members`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, members: [] } ),
    } ) )
    await page.route( `**/api/grapevine/query`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            answer: {
                id: `answer_1`,
                markdown: `Amsterdam is focused on shared meals.`,
                source_message_count: 3,
                time_window: `last_month`,
                model: `openai/gpt-4.1-mini`,
                filters: { hub_ids: [], user_ids: [] },
            },
        } ),
    } ) )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Ask Grapevine` } ).click()
    await page.getByRole( `button`, { name: `Open question` } ).click()
    await page.getByLabel( `Question` ).fill( `What themes are active in Amsterdam?` )
    await page.getByRole( `button`, { name: `Ask`, exact: true } ).click()

    await expect( page.getByText( `Amsterdam is focused on shared meals.` ) ).toBeVisible()
    await page.getByText( `Answer details` ).click()
    await expect( page.getByText( `3 source updates` ) ).toBeVisible()
} )
