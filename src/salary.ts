import holiday_jp from '@holiday-jp/holiday_jp'

/** 割増の時間帯。start/end は 0時からの分で、end <= start なら日をまたぐ */
export interface Premium {
  /** この時間帯の時給(円)。通常の時給の代わりに適用する */
  wage: number
  start: number
  end: number
}

export interface Rules {
  weekday: number
  /** 土曜・日曜・祝日の null は平日と同じ */
  saturday: number | null
  sunday: number | null
  holiday: number | null
  premiums: Premium[]
}

/** 時給の種類。祝日は土日より優先する */
export type DayKind = 'weekday' | 'saturday' | 'sunday' | 'holiday'

export interface Shift {
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  start: string
  end: string
  breakMin: number
}

export interface ShiftPay {
  /** 休憩を除いた労働分数 */
  minutes: number
  /** 割増の時間帯に入っていた分数 */
  premiumMinutes: number
  pay: number
}

const DAY = 24 * 60
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

/** 空文字・null・undefined は null、それ以外は Number に変換する */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return Number(value)
}

/** 数値欄を検証する。空欄は required でなければ value: null */
export function parseAmount(
  label: string,
  raw: unknown,
  { required = false, max = Infinity } = {},
): { value: number | null; error?: string } {
  const n = parseNumber(raw)
  if (n === null) return required ? { value: null, error: `${label}を入力してください。` } : { value: null }
  if (!Number.isFinite(n)) return { value: null, error: `${label}は数値で入力してください。` }
  if (n < 0) return { value: null, error: `${label}は0以上の数値を入力してください。` }
  if (n > max) return { value: null, error: `${label}は${max}以下で入力してください。` }
  return { value: n }
}

/** 割増時給が空欄または0なら割増なし。時給があるときだけ時間帯を検証する */
function parsePremium(
  label: string,
  wage: unknown,
  start: unknown,
  end: unknown,
): { premium?: Premium; errors: string[] } {
  const p = parseAmount(`${label}の時給`, wage)
  if (p.error) return { errors: [p.error] }
  if (!p.value) return { errors: [] }
  const s = toMinutes(String(start))
  const e = toMinutes(String(end))
  if (s === null || e === null) return { errors: [`${label}割増の時間帯(開始と終了)を入力してください。`] }
  if (s === e) return { errors: [`${label}割増の開始と終了が同じ時刻です。`] }
  return { premium: { wage: p.value, start: s, end: e }, errors: [] }
}

export interface RawRules {
  weekday: unknown
  saturday: unknown
  sunday: unknown
  holiday: unknown
  nightWage: unknown
  nightStart: unknown
  nightEnd: unknown
  earlyWage: unknown
  earlyStart: unknown
  earlyEnd: unknown
}

export function parseRules(raw: RawRules): { rules: Rules; errors: string[] } {
  const weekday = parseAmount('平日の時給', raw.weekday, { required: true })
  const saturday = parseAmount('土曜の時給', raw.saturday)
  const sunday = parseAmount('日曜の時給', raw.sunday)
  const holiday = parseAmount('祝日の時給', raw.holiday)
  const night = parsePremium('深夜', raw.nightWage, raw.nightStart, raw.nightEnd)
  const early = parsePremium('早朝', raw.earlyWage, raw.earlyStart, raw.earlyEnd)
  const errors = [weekday, saturday, sunday, holiday].flatMap((r) => (r.error ? [r.error] : []))
  errors.push(...night.errors, ...early.errors)
  const premiums = [night.premium, early.premium].filter((p): p is Premium => !!p)
  return {
    rules: {
      weekday: weekday.value ?? 0,
      saturday: saturday.value,
      sunday: sunday.value,
      holiday: holiday.value,
      premiums,
    },
    errors,
  }
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 例: 10月21日(水) */
export function dateLabel(date: string): string {
  const d = parseDate(date)
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAY_LABELS[d.getDay()]})`
}

const holidays: Record<string, { name: string } | undefined> = holiday_jp.holidays

/** 祝日(振替休日・国民の休日を含む)ならその名前。祝日でなければ undefined */
export function holidayName(date: string): string | undefined {
  return holidays[date]?.name
}

export function dayKind(date: string): DayKind {
  if (holidayName(date)) return 'holiday'
  const dow = parseDate(date).getDay()
  return dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'weekday'
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h > 23 || min > 59 ? null : h * 60 + min
}

/** 日またぎ(終了 < 開始)は翌日の終了として扱う */
function duration(s: number, e: number): number {
  return e > s ? e - s : e + DAY - s
}

export function shiftError(shift: Shift): string | null {
  const s = toMinutes(shift.start)
  const e = toMinutes(shift.end)
  if (s === null || e === null) return '開始と終了の時刻を入力してください。'
  if (s === e) return '開始と終了が同じ時刻です。'
  if (!Number.isFinite(shift.breakMin) || shift.breakMin < 0) return '休憩は0分以上で入力してください。'
  if (shift.breakMin >= duration(s, e)) return '休憩が勤務時間以上です。'
  return null
}

/**
 * 1勤務の給与。shiftError が null の勤務だけ渡す。
 * shortcut: 曜日・祝日の判定は開始日のみ(日またぎで翌日が休日でも開始日の時給)、休憩はその日の通常時給で差し引く。
 * 割増の時間帯が重なった分は高いほうの時給だけ適用する(加算しない)。
 */
export function calcShift(shift: Shift, rules: Rules): ShiftPay {
  const s = toMinutes(shift.start)!
  const e = toMinutes(shift.end)!
  const wage = rules[dayKind(shift.date)] ?? rules.weekday
  const total = duration(s, e)
  let pay = 0
  let premiumMinutes = 0
  for (let t = s; t < s + total; t++) {
    const tod = t % DAY
    let bandWage = 0
    for (const p of rules.premiums) {
      const inBand = p.start < p.end ? tod >= p.start && tod < p.end : tod >= p.start || tod < p.end
      if (inBand) bandWage = Math.max(bandWage, p.wage)
    }
    if (bandWage > 0) premiumMinutes++
    pay += (bandWage || wage) / 60
  }
  pay -= shift.breakMin * (wage / 60)
  return { minutes: total - shift.breakMin, premiumMinutes, pay: Math.round(pay) }
}

export function sumShifts(shifts: Shift[], rules: Rules) {
  return shifts.reduce(
    (acc, s) => {
      const p = calcShift(s, rules)
      return {
        days: acc.days + 1,
        minutes: acc.minutes + p.minutes,
        premiumMinutes: acc.premiumMinutes + p.premiumMinutes,
        pay: acc.pay + p.pay,
      }
    },
    { days: 0, minutes: 0, premiumMinutes: 0, pay: 0 },
  )
}

/** 3桁区切り(円未満は四捨五入) */
export function formatYen(n: number): string {
  return Math.round(n).toLocaleString('ja-JP') + ' 円'
}

/** 3桁区切り(小数2桁固定) */
export function formatHours(n: number): string {
  return n.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' 時間'
}
