# バイト給与計算ツール

時給・1日の労働時間・月の出勤日数から、1日の給与、月給、年収の目安を計算します。税・社会保険料は考慮していません。

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
