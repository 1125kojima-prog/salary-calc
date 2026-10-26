# バイト給与計算ツール

## 概要

時給のルールと出勤日から、その月の給与の目安を計算するWebアプリです。
曜日・祝日ごとの時給、早朝・深夜の時間帯の時給、日またぎ勤務、休憩に対応しています。税・社会保険料は考慮していません。

## 使い方

1. 平日の時給を入力します。土曜・日曜・祝日の時給は、違う場合だけ入力します(空欄なら平日と同じ)。
2. 早朝・深夜の時間帯と、その時間帯の時給(円)を入力します。時給が空欄か0円なら、その割増はありません。
3. 「いつもの勤務」に開始・終了時刻と休憩を入力します。
4. カレンダーの出勤日をタップすると、その時間で入ります。日ごとの変更もできます。
5. 月の給与の目安が表示されます。

## 使用した技術スタック

- TypeScript
- Vite
- [@holiday-jp/holiday_jp](https://github.com/holiday-jp/holiday_jp-js)(祝日判定)
- Node.js 標準のテストランナー(`npm test`)
- GitHub Actions / GitHub Pages(公開)

## 注意

- 1日に複数バイトをしている方は1種類ずつ給与を計算してください。
- 曜日・祝日の判定は勤務開始日で行います。日またぎで翌日が休日でも、開始日の時給になります。
- 休憩は、その日の通常時給で差し引きます。

## アクセス

https://1125kojima-prog.github.io/salary-calc/

ブラウザで開くだけで使えます。インストールは不要です。

## ローカルで動かす

Node.js 20 以上が必要です。

```bash
git clone https://github.com/1125kojima-prog/salary-calc.git
cd salary-calc
npm install
npm run dev
```

表示された URL(通常は http://localhost:5173/salary-calc/ )をブラウザで開いてください。

## ビルド

```bash
npm run build
```

`dist/` に出力されます。`main` ブランチに push すると、GitHub Actions が自動で GitHub Pages に公開します。

## ライセンス

[MIT License](LICENSE)
