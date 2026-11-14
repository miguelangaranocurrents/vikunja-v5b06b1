import {test, expect} from '../../support/fixtures'
import {BucketFactory} from '../../factories/bucket'
import {ProjectFactory} from '../../factories/project'
import {ProjectViewFactory} from '../../factories/project_view'
import {UserFactory} from '../../factories/user'
import {setupApiUrl} from '../../support/authenticateUser'
import {TEST_PASSWORD} from '../../support/constants'

test.describe('Project View Kanban', () => {
	test('Renames a bucket when the session has to be renewed first', async ({page}) => {
		const [user] = await UserFactory.create(1)
		await ProjectFactory.create(1, {owner_id: user.id})
		await ProjectViewFactory.create(1, {id: 4, project_id: 1, view_kind: 3, bucket_configuration_mode: 1})
		const buckets = await BucketFactory.create(2, {project_view_id: 4})

		await setupApiUrl(page)
		await page.goto('/login')
		await page.locator('input[id=username]').fill(user.username)
		await page.locator('input[id=password]').fill(TEST_PASSWORD)
		await page.locator('.button').filter({hasText: 'Login'}).click()
		await expect(page).toHaveURL('/')

		await page.goto('/projects/1/4')
		await page.waitForLoadState('networkidle')
		const title = page.locator('.kanban .bucket .bucket-header .title').first()
		await expect(title).toContainText(buckets[0].title)

		// The session expires while the board is open: the next write is rejected once.
		let rejected = false
		await page.route(new RegExp(`/api/v1/projects/1/views/4/buckets/${buckets[0].id}$`), async route => {
			if (!rejected && route.request().method() === 'POST') {
				rejected = true
				await route.fulfill({
					status: 401,
					contentType: 'application/json',
					body: JSON.stringify({code: 11, message: 'missing, malformed, expired or otherwise invalid token provided'}),
				})
				return
			}
			await route.continue()
		})

		await title.click()
		await title.fill('Waiting for review')
		const renewed = page.waitForResponse(/\/user\/token\/refresh$/)
		await title.press('Enter')
		await renewed
		expect(rejected).toBe(true)
		await page.waitForTimeout(2000)

		await page.reload()
		await expect(page.locator('.kanban .bucket .bucket-header .title').filter({hasText: 'Waiting for review'})).toBeVisible()
	})
})
