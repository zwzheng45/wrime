import { test, expect } from '@playwright/test'
import { changeVariant, init, input, expectValue, luna, selectIME } from './util'

const ime = '小鹤音形'
const schemaId = 'flypy_xhfast'
const largeModel = /wanxiang-lts-zh-hans\.gram$/

test('Large model is not loaded by default', async ({ page }) => {
  let requested = false
  page.on('request', request => {
    requested ||= largeModel.test(request.url())
  })

  await init(page)
  await page.waitForTimeout(1000)
  expect(requested).toBeFalsy()
})

test('Large model starts loading after selecting Flypy', async ({ page }) => {
  let requested = false
  await page.route(largeModel, route => {
    requested = true
    return route.abort()
  })

  await init(page, ime, schemaId)
  await expect.poll(() => requested, { timeout: 10000 }).toBeTruthy()
  await expect(page.getByText(/模型：小模型/)).toBeVisible()
})

test('Large model becomes active', async ({ page }) => {
  test.setTimeout(120000)
  await init(page, ime, schemaId)
  await expect(page.getByText(/模型：万象 LTS/)).toBeVisible({ timeout: 90000 })

  await input(page, 'jmjmdejqbuzdyile ')
  await expectValue(page, '渐渐的就不在意了')
})

test('Flypy variant does not leak to Luna Pinyin', async ({ page }) => {
  await page.route(largeModel, route => route.abort())
  await init(page, ime, schemaId, '繁')
  await input(page, 'ul', 'pb ')
  await expectValue(page, '雙拼')

  await selectIME(page, luna)
  await input(page, 'jian', 'ti ')
  await expectValue(page, '雙拼简体')

  await changeVariant(page, '繁')
  await input(page, 'fan', 'ti ')
  await expectValue(page, '雙拼简体繁體')

  await changeVariant(page, '简')
  await input(page, 'jian', 'ti ')
  await expectValue(page, '雙拼简体繁體简体')
})

test.describe('Flypy xhfast', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(largeModel, route => route.abort())
  })

  test('Simplified', async ({ page }) => {
    await init(page, ime, schemaId)

    await input(page, 'ul', 'pb ')
    await expectValue(page, '双拼')
  })

  test('Traditional', async ({ page }) => {
    await init(page, ime, schemaId, '繁')

    await input(page, 'ul', 'pb ')
    await expectValue(page, '雙拼')
  })

  test('Tab auxiliary code', async ({ page }) => {
    await init(page, ime, schemaId)

    await input(page, 'xn')
    await page.keyboard.press('Tab')
    await input(page, 'ld')
    await expectValue(page, '小')
  })

  test('Lua translators', async ({ page }) => {
    await init(page, ime, schemaId)

    await input(page, 'date ')
    await expectValue(page, /年.*月.*日/)

    await input(page, 'n/123 ')
    await expectValue(page, /一百二十三/)
  })
})
