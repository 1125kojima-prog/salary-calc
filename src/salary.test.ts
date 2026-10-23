import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcShift, dayKind, holidayName, parseRules, shiftError } from './salary.ts'

const hm = (h: number, m = 0) => h * 60 + m
const night = { rate: 0.25, start: hm(22), end: hm(5) }
const early = { rate: 0.2, start: hm(5), end: hm(8) }
const rules = { weekday: 1000, saturday: 1100, sunday: 1200, holiday: 1500, premiums: [night] }
// 2026-10-21 水 / 10-24 土 / 10-25 日 / 10-12 月(スポーツの日) / 05-03 日(憲法記念日)
const shift = (date: string, start: string, end: string, breakMin = 0) => ({ date, start, end, breakMin })

test('平日の通常勤務', () => {
  assert.deepEqual(calcShift(shift('2026-10-21', '17:00', '22:00'), rules), {
    minutes: 300,
    premiumMinutes: 0,
    pay: 5000,
  })
})

test('曜日と祝日で時給が変わる', () => {
  const pay = (date: string) => calcShift(shift(date, '12:00', '15:00'), rules).pay
  assert.equal(pay('2026-10-24'), 3300) // 土
  assert.equal(pay('2026-10-25'), 3600) // 日
  assert.equal(pay('2026-10-12'), 4500) // 平日にあたる祝日
})

test('日曜が祝日なら祝日の時給が優先', () => {
  assert.equal(dayKind('2026-05-03'), 'holiday')
  assert.equal(calcShift(shift('2026-05-03', '12:00', '15:00'), rules).pay, 4500)
})

test('土日祝の時給が未設定なら平日と同じ', () => {
  const blank = { ...rules, saturday: null, sunday: null, holiday: null }
  for (const date of ['2026-10-24', '2026-10-25', '2026-10-12']) {
    assert.equal(calcShift(shift(date, '12:00', '15:00'), blank).pay, 3000)
  }
})

test('祝日の判定', () => {
  assert.equal(holidayName('2026-10-12'), 'スポーツの日')
  assert.equal(holidayName('2026-10-21'), undefined)
  assert.equal(holidayName('2026-09-22'), '休日') // 国民の休日
  assert.equal(dayKind('2026-10-21'), 'weekday')
  assert.equal(dayKind('2026-10-24'), 'saturday')
  assert.equal(dayKind('2026-10-25'), 'sunday')
})

test('22時以降は深夜割増', () => {
  const r = calcShift(shift('2026-10-21', '21:00', '23:00'), rules)
  assert.equal(r.pay, 2250)
  assert.equal(r.premiumMinutes, 60)
})

test('日またぎ勤務', () => {
  const r = calcShift(shift('2026-10-21', '23:00', '02:00'), rules)
  assert.equal(r.minutes, 180)
  assert.equal(r.pay, 3750)
})

test('休憩は通常時給で差し引く', () => {
  const r = calcShift(shift('2026-10-21', '18:00', '23:00', 60), rules)
  assert.equal(r.minutes, 240)
  assert.equal(r.pay, 4250)
})

test('早朝割増は設定した時間帯だけ付く', () => {
  const both = { ...rules, premiums: [night, early] }
  // 4-5時は深夜25%、5-7時は早朝20%
  const r = calcShift(shift('2026-10-21', '04:00', '07:00'), both)
  assert.equal(r.pay, 1250 + 2 * 1200)
  assert.equal(r.premiumMinutes, 180)
  // 早朝を設定していなければ5時以降は通常時給
  assert.equal(calcShift(shift('2026-10-21', '05:00', '07:00'), rules).pay, 2000)
})

test('割増の時間帯が重なったら高いほうの率だけ', () => {
  const overlap = { ...rules, premiums: [night, { rate: 0.5, start: hm(23), end: hm(1) }] }
  // 22-23時は25%、23-24時は重なって50%
  assert.equal(calcShift(shift('2026-10-21', '22:00', '00:00'), overlap).pay, 1250 + 1500)
})

test('勤務の入力チェック', () => {
  assert.equal(shiftError(shift('2026-10-21', '17:00', '22:00')), null)
  assert.ok(shiftError(shift('2026-10-21', '', '22:00')))
  assert.ok(shiftError(shift('2026-10-21', '17:00', '17:00')))
  assert.ok(shiftError(shift('2026-10-21', '17:00', '18:00', 60)))
  assert.ok(shiftError(shift('2026-10-21', '17:00', '18:00', -5)))
})

const raw = {
  weekday: '1000',
  saturday: '',
  sunday: '',
  holiday: '',
  nightPercent: '25',
  nightStart: '22:00',
  nightEnd: '05:00',
  earlyPercent: '',
  earlyStart: '05:00',
  earlyEnd: '08:00',
}

test('時給ルールの入力チェック', () => {
  assert.equal(parseRules({ ...raw, weekday: '' }).errors.length, 1)
  assert.equal(parseRules({ ...raw, holiday: '-1' }).errors.length, 1)
  assert.equal(parseRules({ ...raw, nightPercent: '101' }).errors.length, 1)
  const ok = parseRules({ ...raw, saturday: '1100', holiday: '1500' })
  assert.deepEqual(ok.rules, {
    weekday: 1000,
    saturday: 1100,
    sunday: null,
    holiday: 1500,
    premiums: [night],
  })
  assert.deepEqual(ok.errors, [])
})

test('割増率が空欄か0なら時間帯は見ない', () => {
  assert.deepEqual(parseRules({ ...raw, nightPercent: '' }).rules.premiums, [])
  const r = parseRules({ ...raw, nightPercent: '0', earlyPercent: '', earlyStart: '', earlyEnd: '' })
  assert.deepEqual(r.rules.premiums, [])
  assert.deepEqual(r.errors, [])
})

test('割増率があるのに時間帯が不正ならエラー', () => {
  assert.equal(parseRules({ ...raw, earlyPercent: '20', earlyStart: '', earlyEnd: '08:00' }).errors.length, 1)
  assert.equal(parseRules({ ...raw, earlyPercent: '20', earlyStart: '06:00', earlyEnd: '06:00' }).errors.length, 1)
  const ok = parseRules({ ...raw, earlyPercent: '20' })
  assert.deepEqual(ok.rules.premiums, [night, early])
})
