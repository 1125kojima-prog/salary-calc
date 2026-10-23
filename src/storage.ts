import type { Rules, Shift } from './salary'

/** 入力欄の文字列をそのまま保存する */
export interface Settings {
  weekday: string
  saturday: string
  sunday: string
  holiday: string
  nightPercent: string
  nightStart: string
  nightEnd: string
  earlyPercent: string
  earlyStart: string
  earlyEnd: string
  start: string
  end: string
  breakMin: string
}

export interface HistoryEntry {
  /** YYYY-MM */
  ym: string
  pay: number
  bonus: number
  days: number
  minutes: number
  rules: Rules
  shifts: Shift[]
}

export interface Stored {
  settings: Settings
  history: HistoryEntry[]
}

const KEY = 'salary-calc:v1'

const defaultSettings: Settings = {
  weekday: '',
  saturday: '',
  sunday: '',
  holiday: '',
  nightPercent: '',
  nightStart: '22:00',
  nightEnd: '05:00',
  earlyPercent: '',
  earlyStart: '05:00',
  earlyEnd: '08:00',
  start: '17:00',
  end: '22:00',
  breakMin: '0',
}

function isEntry(e: any): e is HistoryEntry {
  return (
    typeof e?.ym === 'string' &&
    typeof e.pay === 'number' &&
    typeof e.days === 'number' &&
    typeof e.minutes === 'number' &&
    Array.isArray(e.rules?.premiums) && // 時給ルールの形式が違う古い記録は読み飛ばす
    'holiday' in e.rules &&
    Array.isArray(e.shifts)
  )
}

export function load(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    // 一時対応: 旧初期値の25が残っている動作確認用ブラウザを「なし」に戻す。確認後に削除する
    if (raw?.settings?.nightPercent === '25') raw.settings.nightPercent = ''
    return {
      settings: { ...defaultSettings, ...raw?.settings },
      history: Array.isArray(raw?.history) ? raw.history.filter(isEntry) : [],
    }
  } catch {
    return { settings: { ...defaultSettings }, history: [] }
  }
}

/** プライベートモードや容量超過では保存できない。結果を返す */
export function save(data: Stored): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}
