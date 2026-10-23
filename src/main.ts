import './style.css'
import {
  calcShift,
  dateLabel,
  formatHours,
  holidayName,
  formatYen,
  parseAmount,
  parseRules,
  shiftError,
  sumShifts,
} from './salary'
import type { Rules, Shift } from './salary'
import { load, save } from './storage'
import type { HistoryEntry } from './storage'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const val = (id: string) => $<HTMLInputElement>(id).value
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
  const e = document.createElement(tag)
  e.textContent = text
  if (className) e.className = className
  return e
}
const pad = (n: number) => String(n).padStart(2, '0')

const stored = load()
const today = new Date()
const year = today.getFullYear()
const todayStr = `${year}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
let month = today.getMonth() + 1
let selected: string | null = null
const shifts = new Map<string, Shift>() // 日付 → 勤務(月をまたいで保持する)
let current: HistoryEntry | null = null // 直近の計算結果(保存用)

const settingIds = {
  weekday: 'wageWeekday',
  saturday: 'wageSaturday',
  sunday: 'wageSunday',
  holiday: 'wageHoliday',
  nightPercent: 'nightPercent',
  nightStart: 'nightStart',
  nightEnd: 'nightEnd',
  earlyPercent: 'earlyPercent',
  earlyStart: 'earlyStart',
  earlyEnd: 'earlyEnd',
  start: 'defStart',
  end: 'defEnd',
  breakMin: 'defBreak',
} as const
const settingKeys = Object.keys(settingIds) as (keyof typeof settingIds)[]

for (const k of settingKeys) $<HTMLInputElement>(settingIds[k]).value = stored.settings[k]

function showErrors(id: string, list: string[]) {
  const box = $(id)
  box.hidden = list.length === 0
  const ul = el('ul')
  for (const m of list) ul.append(el('li', m))
  box.replaceChildren(ul)
}

/** 入力が変わったら古い結果を隠す */
function invalidate() {
  current = null
  $('result').hidden = true
  $('saveStatus').textContent = ''
}

function persist() {
  for (const k of settingKeys) stored.settings[k] = val(settingIds[k])
  save(stored)
}

$('settings').addEventListener('input', () => {
  persist()
  invalidate()
})
$('bonus').addEventListener('input', invalidate)

/* ===== カレンダー ===== */

function renderTabs() {
  const box = $('monthTabs')
  box.replaceChildren()
  for (let m = 1; m <= 12; m++) {
    const b = el('button', `${m}月`)
    b.type = 'button'
    b.setAttribute('aria-pressed', String(m === month))
    b.onclick = () => {
      month = m
      selected = null
      showErrors('calError', [])
      invalidate()
      render()
    }
    box.append(b)
  }
}

function renderCalendar() {
  $('calHeading').textContent = `${year}年${month}月`
  const grid = $('calGrid')
  grid.replaceChildren()
  ;['日', '月', '火', '水', '木', '金', '土'].forEach((w, i) => {
    grid.append(el('span', w, i === 0 ? 'dow sun' : i === 6 ? 'dow sat' : 'dow'))
  })
  const first = new Date(year, month - 1, 1).getDay()
  const days = new Date(year, month, 0).getDate()
  for (let i = 0; i < first; i++) grid.append(el('span'))
  for (let d = 1; d <= days; d++) {
    const date = `${year}-${pad(month)}-${pad(d)}`
    const dow = (first + d - 1) % 7
    const work = shifts.has(date)
    const holiday = holidayName(date)
    const classes = [
      'day',
      (dow === 0 || holiday) && 'sun',
      dow === 6 && !holiday && 'sat',
      work && 'work',
      date === selected && 'selected',
      date === todayStr && 'today',
    ]
    const b = el('button', String(d), classes.filter(Boolean).join(' '))
    b.type = 'button'
    b.setAttribute('aria-pressed', String(work))
    b.setAttribute('aria-label', dateLabel(date) + (holiday ? ` ${holiday}` : '') + (work ? ' 出勤' : ''))
    if (holiday) b.title = holiday
    b.onclick = () => tapDay(date)
    grid.append(b)
  }
}

function renderEditor() {
  const s = selected ? shifts.get(selected) : undefined
  $('dayEditor').hidden = !s
  if (!s) return
  const holiday = holidayName(s.date)
  $('editTitle').textContent = `${dateLabel(s.date)}${holiday ? `・${holiday}` : ''}の時間を変更`
  $<HTMLInputElement>('editStart').value = s.start
  $<HTMLInputElement>('editEnd').value = s.end
  $<HTMLInputElement>('editBreak').value = String(s.breakMin)
}

function render() {
  renderTabs()
  renderCalendar()
  renderEditor()
}

/** 出勤でない日は「いつもの勤務」で追加して編集欄を開き、出勤の日はもう一度タップで取り消す */
function tapDay(date: string) {
  if (shifts.delete(date)) {
    if (selected === date) selected = null
  } else {
    const s: Shift = {
      date,
      start: val('defStart'),
      end: val('defEnd'),
      breakMin: val('defBreak') === '' ? 0 : Number(val('defBreak')),
    }
    const err = shiftError(s)
    if (err) {
      showErrors('calError', [`「いつもの勤務」を確認してください。${err}`])
      return
    }
    shifts.set(date, s)
    selected = date
  }
  showErrors('calError', [])
  invalidate()
  render()
}

const editField = (id: string, apply: (s: Shift, v: string) => void) =>
  $(id).addEventListener('input', () => {
    const s = selected && shifts.get(selected)
    if (s) {
      apply(s, val(id))
      invalidate()
    }
  })
editField('editStart', (s, v) => { s.start = v })
editField('editEnd', (s, v) => { s.end = v })
editField('editBreak', (s, v) => { s.breakMin = v === '' ? 0 : Number(v) })

/* ===== 計算・結果 ===== */

function breakdown(list: Shift[], rules: Rules): HTMLElement {
  const ul = el('ul', '', 'breakdown')
  for (const s of list) {
    const p = calcShift(s, rules)
    ul.append(el('li', `${dateLabel(s.date)} ${s.start}〜${s.end} ${formatHours(p.minutes / 60)} ${formatYen(p.pay)}`))
  }
  return ul
}

function renderResult(r: HistoryEntry) {
  const total = sumShifts(r.shifts, r.rules)
  const [y, m] = r.ym.split('-')
  $('outTitle').textContent = `${y}年${Number(m)}月分の給与(目安)`
  $('outTotal').textContent = formatYen(r.pay)
  $('outShiftPay').textContent = formatYen(total.pay)
  $('bonusRow').hidden = r.bonus === 0
  $('outBonus').textContent = formatYen(r.bonus)
  $('outDays').textContent = `${total.days} 日`
  $('outHours').textContent = formatHours(total.minutes / 60)
  $('outNight').textContent = formatHours(total.premiumMinutes / 60)
  $('outBreakdown').replaceChildren(breakdown(r.shifts, r.rules))
  $('result').hidden = false
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault()
  const { rules, errors } = parseRules({
    weekday: val('wageWeekday'),
    saturday: val('wageSaturday'),
    sunday: val('wageSunday'),
    holiday: val('wageHoliday'),
    nightPercent: val('nightPercent'),
    nightStart: val('nightStart'),
    nightEnd: val('nightEnd'),
    earlyPercent: val('earlyPercent'),
    earlyStart: val('earlyStart'),
    earlyEnd: val('earlyEnd'),
  })
  const bonus = parseAmount('ボーナス', val('bonus'))
  if (bonus.error) errors.push(bonus.error)

  const prefix = `${year}-${pad(month)}-`
  const monthShifts = [...shifts.values()]
    .filter((s) => s.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (monthShifts.length === 0) errors.push(`${month}月の出勤日をカレンダーで選んでください。`)
  for (const s of monthShifts) {
    const err = shiftError(s)
    if (err) errors.push(`${dateLabel(s.date)}: ${err}`)
  }

  showErrors('errors', errors)
  if (errors.length > 0) {
    invalidate()
    return
  }

  const total = sumShifts(monthShifts, rules)
  current = {
    ym: `${year}-${pad(month)}`,
    pay: total.pay + (bonus.value ?? 0),
    bonus: bonus.value ?? 0,
    days: total.days,
    minutes: total.minutes,
    rules,
    shifts: monthShifts,
  }
  $('saveStatus').textContent = ''
  renderResult(current)
})

/* ===== 履歴 ===== */

function renderHistory() {
  const list = $('historyList')
  list.replaceChildren()
  const items = [...stored.history].sort((a, b) => b.ym.localeCompare(a.ym))
  $('historyEmpty').hidden = items.length > 0

  const yearItems = items.filter((h) => h.ym.startsWith(`${year}-`))
  $('yearTotal').hidden = yearItems.length === 0
  $('yearTotal').textContent = `${year}年の合計 ${formatYen(yearItems.reduce((sum, h) => sum + h.pay, 0))}`

  for (const h of items) {
    const [y, m] = h.ym.split('-')
    const d = el('details')
    d.append(el('summary', `${y}年${Number(m)}月分 ${formatYen(h.pay)}`))
    d.append(el('p', `出勤${h.days}日・${formatHours(h.minutes / 60)}${h.bonus ? `・ボーナス${formatYen(h.bonus)}込み` : ''}`, 'hint-text'))
    d.append(breakdown(h.shifts, h.rules))
    const del = el('button', 'この記録を削除', 'delete')
    del.type = 'button'
    del.onclick = () => {
      if (!confirm(`${y}年${Number(m)}月分の記録を削除しますか?`)) return
      stored.history = stored.history.filter((x) => x.ym !== h.ym)
      save(stored)
      renderHistory()
    }
    d.append(del)
    list.append(d)
  }
}

$('saveBtn').addEventListener('click', () => {
  const entry = current
  if (!entry) return
  stored.history = [entry, ...stored.history.filter((h) => h.ym !== entry.ym)]
  const ok = save(stored)
  $('saveStatus').textContent = ok
    ? `${Number(entry.ym.split('-')[1])}月分を保存しました。`
    : 'このブラウザでは保存できませんでした(プライベートモードなど)。'
  renderHistory()
})

render()
renderHistory()
