# 就活ダッシュボード

就活で見る企業、選考予定、ES、面接メモをまとめて管理するためのNext.jsアプリです。Supabaseをデータベースとして使い、Gemini APIで企業情報のリサーチ補助もできます。

主な機能は次のとおりです。

- 企業情報の登録、編集、削除
- インターンと本選考を同時に確認できる上下分割カンバン表示
- 同じ企業への複数選考の登録と、それぞれの進捗管理
- 企業ごとの条件比較
- ES締切、面接、説明会などのカレンダー管理。予定は選考に紐づけられ、提出や受検が済んだら「完了」にできます
- 画面上部の「要確認」：期限超過（14日以内）と7日以内の締切、14日以内の面接、未回答のESを日付順に1行で表示します。帯に収まらない分は「+N件」から一覧で開け、一覧から予定を完了にできます
- ESメモ：左に設問の一覧（未回答・締切の近い順）、右に回答を並べ、回答はその場で書けて自動保存されます
- 面接メモ：左に面接の一覧（今後・過去・予定なし）、右にその面接のメモを種別ごとに表示します。「質問別」に切り替えるとトピックごとに読めます
- Geminiによる企業リサーチ
- 共通パスワードによる簡易ログイン

## セットアップ

自分専用のダッシュボードを作る手順です。ブラウザだけで完了し、PCへのインストールは不要です。

用意するアカウントは[GitHub](https://github.com/)と[Vercel](https://vercel.com/)（アプリの公開先）です。データの保存先の[Supabase](https://supabase.com/)は、途中の画面から作れます。いずれも無料プランで使えます。

AIによる企業リサーチも使う場合は、[Google AI Studio](https://aistudio.google.com/)でAPIキーを発行します。あとから追加できます。

### かんたんセットアップ（おすすめ）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fponto2%2Fjob-hunting-dashboard&project-name=job-hunting-dashboard&repository-name=job-hunting-dashboard&env=AUTH_PASSWORD&envDescription=%E3%83%AD%E3%82%B0%E3%82%A4%E3%83%B3%E7%94%BB%E9%9D%A2%E3%81%A7%E5%85%A5%E5%8A%9B%E3%81%99%E3%82%8B%E3%83%91%E3%82%B9%E3%83%AF%E3%83%BC%E3%83%89%E3%81%A7%E3%81%99%E3%80%82%E8%87%AA%E5%88%86%E3%81%A7%E6%B1%BA%E3%82%81%E3%81%9F%E3%80%81%E6%8E%A8%E6%B8%AC%E3%81%95%E3%82%8C%E3%81%AB%E3%81%8F%E3%81%84%E3%82%82%E3%81%AE%E3%82%92%E5%85%A5%E3%82%8C%E3%81%A6%E3%81%8F%E3%81%A0%E3%81%95%E3%81%84%E3%80%82&envLink=https%3A%2F%2Fgithub.com%2Fponto2%2Fjob-hunting-dashboard%23%E7%92%B0%E5%A2%83%E5%A4%89%E6%95%B0%E3%81%AE%E4%B8%80%E8%A6%A7&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22supabase%22%2C%22productSlug%22%3A%22supabase%22%7D%5D)

1. 上のボタンを押し、GitHubアカウントでVercelにログインします。
2. 画面の案内に従って、自分のGitHubにリポジトリのコピーを作ります。
3. Supabaseを追加する画面が出たら、案内に従ってデータベースを作ります。リージョンは`Northeast Asia (Tokyo)`が近くて速いです。
4. `AUTH_PASSWORD`に、自分で決めたログイン用パスワードを入れます。
5. Deployを押します。

データベースのテーブルは、最初のデプロイのときに自動で作られます。SQLを実行する必要はありません。発行されたURLを開き、`AUTH_PASSWORD`でログインして、企業を1社追加できれば完了です。

`AUTH_PASSWORD`は、このアプリを開ける唯一の鍵です。URLを知っている人なら誰でもログイン画面にたどり着けるため、長く推測されにくいものにしてください。

企業リサーチを使う場合は、VercelのSettings → Environment Variablesに`GEMINI_API_KEY`を追加し、DeploymentsからRedeployします。

### 手動でセットアップする

Supabaseのプロジェクトを自分で作りたい場合や、ボタンでうまくいかない場合の手順です。15分ほどで終わります。

#### 1. リポジトリをForkする

このページ右上のForkを押し、自分のGitHubアカウントにコピーを作ります。あとで元リポジトリの更新を取り込めるよう、Forkがおすすめです。

#### 2. Supabaseでデータベースを作る

1. [Supabase](https://supabase.com/)にログインし、New projectでプロジェクトを作ります。リージョンは`Northeast Asia (Tokyo)`が近くて速いです。
2. 左メニューのSQL Editorを開きます。
3. [`supabase/schema.sql`](supabase/schema.sql)を開き、内容をすべてコピーしてSQL Editorに貼り付け、Runを押します。`Success. No rows returned`と出れば完了です。

実行するSQLはこの1ファイルだけです。途中で失敗した場合は何も作られないので、原因を直してからもう一度実行できます。

続けて、次の2つの値を控えます。

| 値 | 場所 |
| --- | --- |
| Project URL | Project Settings → Data API |
| Secret key（または`service_role` key） | Project Settings → API Keys |

Secret keyはデータベースを自由に読み書きできる鍵です。他人に見せたり、チャットやスクリーンショットに載せたりしないでください。

#### 3. Vercelにデプロイする

1. [Vercel](https://vercel.com/)にGitHubアカウントでログインします。
2. Add New → Projectから、手順1でForkしたリポジトリをImportします。
3. Environment Variablesを開き、次の値を入れます。

| 環境変数 | 入れる値 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 手順2のProject URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 手順2のSecret key |
| `AUTH_PASSWORD` | 自分で決めたログイン用パスワード |
| `GEMINI_API_KEY`（任意） | Google AI StudioのAPIキー |

4. Deployを押します。ほかの設定は変更不要です。

`AUTH_PASSWORD`は、このアプリを開ける唯一の鍵です。URLを知っている人なら誰でもログイン画面にたどり着けるため、長く推測されにくいものにしてください。

#### 4. 動作を確認する

発行されたURLを開き、`AUTH_PASSWORD`でログインします。企業を1社追加できれば、セットアップは完了です。

うまくいかない場合は[トラブルシューティング](#トラブルシューティング)を確認してください。環境変数を変更したあとは、VercelのDeploymentsからRedeployが必要です。

Supabaseの無料プランでは、しばらくアクセスがないとプロジェクトが一時停止されることがあります。その場合はSupabaseのダッシュボードから再開できます。

### 環境変数の一覧

| 環境変数 | 必須 | 用途 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ○ | Supabaseの接続先 |
| `SUPABASE_SERVICE_ROLE_KEY` | ○ | アプリのAPIがデータベースに接続するためのサーバー専用キー |
| `AUTH_PASSWORD` | ○ | アプリへのログイン |
| `GEMINI_API_KEY` | | 企業リサーチ機能。未設定でもほかの機能は使えます |
| `POSTGRES_URL_NON_POOLING` | | データベースの自動セットアップと自動更新。PostgreSQLの接続文字列を入れます。未設定なら、SQLはSQL Editorで手動実行します |
| `AUTH_SECRET` | | ログイン状態（セッション）の署名鍵。未設定なら`AUTH_PASSWORD`を使います |
| `NEXT_PUBLIC_GRADUATION_YEAR` | | 卒業年度の下2桁（例: `28`）。「28卒マイページ」などの表示と、AIリサーチで探す採用ページの年度。未設定なら`28` |

`SUPABASE_SERVICE_ROLE_KEY`には`NEXT_PUBLIC_`を付けないでください。付けるとブラウザに配信されます。

かんたんセットアップでは、Supabaseの連携機能が接続用の環境変数（`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SECRET_KEY`、`POSTGRES_URL_NON_POOLING`など）を自動で設定します。アプリは`SUPABASE_SERVICE_ROLE_KEY`がなければ`SUPABASE_SECRET_KEY`を使うので、自分で入れるのは`AUTH_PASSWORD`だけです。

`AUTH_SECRET`は、次のコマンドなどで作った値を設定するのがおすすめです。設定すると、パスワードそのものを署名に使わずに済みます。値を変えると、発行済みのログイン状態がすべて無効になります。ログアウトはこのブラウザのログイン状態を消すだけなので、ほかの端末でのログインをまとめて取り消したいときは`AUTH_SECRET`を変えてください。

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`NEXT_PUBLIC_GRADUATION_YEAR`はビルド時に読み込まれます。変更した場合はRedeployしてください。

## 既存環境を更新する場合

元リポジトリの更新を取り込む手順です。先に、アプリの「その他」→「エクスポート（全データ）」でバックアップを保存してください。

### 1. コードを更新する

Forkした場合は、GitHubで自分のForkを開き、Sync forkを押します。

かんたんセットアップで作ったリポジトリはForkではないため、Sync forkが出ません。PCにcloneして、次のように取り込みます。

```bash
git remote add upstream https://github.com/ponto2/job-hunting-dashboard.git
```

```bash
git pull upstream main
```

```bash
git push
```

どちらの場合も、Vercelが自動で新しいバージョンをデプロイします。

### 2. データベースを更新する

かんたんセットアップで作った環境（`POSTGRES_URL_NON_POOLING`が設定されている環境）では、デプロイのときに自動で更新されます。作業は不要です。

手動でセットアップした環境では、[`supabase/migrations/`](supabase/migrations/)に、まだ実行していない`.sql`ファイルがあれば、SupabaseのSQL Editorでファイル名の古い順に1つずつ実行します。実行済みのファイルは、SQL Editorで次を実行すると確認できます。ここに出てこないファイルが未実行です。

```sql
select version, applied_at from public.schema_migrations order by version;
```

`supabase/migrations/`のファイルは何度実行しても安全です。迷ったら、すべて古い順に実行して構いません。

### データベースの自動更新の仕組み

`npm run build`は、最初に[`scripts/migrate.mjs`](scripts/migrate.mjs)を実行します。テーブルがなければ`supabase/schema.sql`を、あれば`supabase/migrations/`の未実行ファイルを適用します。失敗するとビルドが止まり、それまでのバージョンが動き続けます。

- 接続文字列（`POSTGRES_URL_NON_POOLING`、なければ`POSTGRES_URL`、`DATABASE_URL`）がなければ何もしません。
- Vercelでは本番（Production）のデプロイでだけ実行します。プレビューのデプロイはデータベースを変更しません。
- 手動でセットアップした環境でも、Supabaseの接続文字列（Connect → Session pooler）を`POSTGRES_URL_NON_POOLING`に設定すれば、以降は自動で更新されます。

## ローカルで開発する

コードを変更したい場合の手順です。Node.js 20.9以上が必要です。

```bash
git clone https://github.com/<ユーザー名>/job-hunting-dashboard.git
cd job-hunting-dashboard
npm install
cp .env.example .env.local
```

`.env.local`を開き、[セットアップ](#セットアップ)で控えた値を入れます。`.env.local`は`.gitignore`で除外されています。

```bash
npm run dev
```

ブラウザで[http://localhost:3000/login](http://localhost:3000/login)を開き、`AUTH_PASSWORD`を入力します。

このリポジトリはNext.js 16のApp Router構成です。Next.js 16は従来バージョンと異なる点があるため、実装を変更する場合は`node_modules/next/dist/docs/`の同梱ドキュメントも確認してください。

### データベースの定義を変更するとき

- [`supabase/schema.sql`](supabase/schema.sql)は、新規セットアップ用の完全な定義です。常に最新の状態を表します。
- [`supabase/migrations/`](supabase/migrations/)は、すでに使っている環境向けの差分です。

定義を変えるときは、差分を`supabase/migrations/<日時>_<内容>.sql`として追加し、同じ変更を`schema.sql`にも反映します。差分は何度実行しても同じ結果になるように書き（`if not exists`など）、最後に`schema_migrations`へ自分のファイル名（拡張子なし）を記録します。`schema.sql`の末尾の一覧にも同じ名前を追加してください。`npm run test:db`が、`schema.sql`と差分の結果が一致することを検証します。

## データベースへのアクセス方式

データベースには、アプリのAPI（サーバー側）だけが`SUPABASE_SERVICE_ROLE_KEY`で接続します。各テーブルはRLSを有効にしたうえでポリシーを置かず、公開用のanonキーからの読み書きをすべて拒否します。そのため、SupabaseのURLやanonキーを知られても、アプリのパスワードを通らずにデータを読み書きされることはありません。

このアプリは1人で使う前提です。公開サービスや複数ユーザーでの運用にする場合は、Supabase Authを導入し、ユーザーIDに基づくRLSを設計してください。

## 予定とAIリサーチの扱い

予定には日本時間の開始・締切時刻と終了時刻を任意で保存できます。空欄なら日付だけで扱います。「要確認」などの日単位の表示は日本時間の日付変更・画面復帰時に更新します。時刻を設定しても通知は送信しません。

AIリサーチの結果は企業編集フォームで確認・修正してから保存します。出典URL・対象年度・対象範囲は数値と別に保持し、企業詳細・比較画面から確認できます。AIが出典情報を返さない場合は、情報が確認済みとは扱わないでください。

選考の成功時の保存値は「合格」に統一し、画面ではインターンを「参加決定」、本選考を「内定」と表示します。

## 使用技術

- Next.js 16（App Router）
- React 19
- Supabase
- Google Gemini API
- Vercel

## よく使うコマンド

```bash
npm run dev
```

開発サーバーを起動します。

```bash
npm run build
```

本番用にビルドします。Vercelでもこのコマンドが使われます。接続文字列が設定されていれば、ビルドの前にデータベースを最新にします（[データベースの自動更新の仕組み](#データベースの自動更新の仕組み)）。

```bash
npm run start
```

ビルド済みアプリを本番モードで起動します。先に`npm run build`が必要です。

```bash
npm test
```

`tests/`の`*.test.mjs`をすべて実行し、入力検証・APIの振る舞い・認証・バックアップ形式などを確認します。APIテストは認証・データベース境界を置き換えて実行するため、実際のSupabaseデータは変更しません。データベース定義の検証は後述の`npm run test:db`で行います。`npm`が使えない環境では`node --experimental-vm-modules --test`でも同じテストを実行できます。

```bash
npm run lint
```

ESLint（Next.js推奨設定）でコードを検査します。

```bash
npm run test:ui
```

選考カンバン（`tests/kanban-ui.mjs`）と、ESメモ・面接メモ（`tests/memo-ui.mjs`）の画面操作をPlaywrightで確認します。先に別のターミナルで`npm run dev`を起動しておきます（既定の接続先は`http://localhost:3000`、`KANBAN_TEST_URL`で変更できます。`127.0.0.1`は開発サーバーのリソース制限に掛かることがあるので、`localhost`を使ってください）。APIはすべてテスト用データに置き換えるので、ログインやSupabaseへの接続は不要です。ブラウザはインストール済みのGoogle Chromeを使います。

追加した回帰テストは、ESの初期選択維持、保存失敗後のログアウト、保存中の予定、AI結果の修正、日付変更を確認します。CIと同じようにサーバーも起動・終了させる場合は `npm run test:ui:ci` を使います（ポート3100、`UI_TEST_PORT`で変更可能）。`PLAYWRIGHT_CHANNEL=chromium` でPlaywrightのChromiumも使用できます。

DB統合テストはPostgreSQL 16以上と`psql`・`createdb`・`dropdb`を使います。テスト用サーバーの `PGHOST`・`PGUSER`・必要なら`PGPASSWORD`を設定し、`npm run test:db` を実行してください。専用の一時データベースを作成・削除するため、ユーザーにはDB作成権限が必要です。本番接続情報は使わないでください。`supabase/schema.sql`が空のデータベースに適用できること、`supabase/migrations/`の差分と一致すること、復元の再実行・ロールバック、参照整合性、設問の一括更新、service_roleからの利用とanonアクセスの拒否を検証します。

GitHubへのpushとPull Requestでは、GitHub Actions（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）がlint・単体テスト・ビルド・画面テスト・PostgreSQL統合テストを自動で実行します。

## コードの構成

- `app/page.js`：ダッシュボード全体の状態（企業・予定・ESメモ・面接メモ）を読み込み、各タブに渡します。上部のタブと、締切や面接をまとめた「要確認」の帯（`app/components/AttentionStrip.js`、項目の組み立ては`lib/attention.js`）も、ここで読み込んだデータを使います。初めて開いたときは「選考状況」を表示し、以降は最後に見たタブを開きます。
- `app/components/`：各タブの画面とモーダル。企業の詳細・編集・削除のダイアログは`CompanyDetailModals.js`に、企業や選考を保存する処理は`app/lib/company-actions.js`にまとめ、企業一覧とカンバンで共有しています。
- `app/api/`：サーバー側のAPI。入力チェックは`lib/validation.js`にまとめています。
- `app/styles/`：画面ごとのCSS。色や文字サイズなどの共通の値は`base.css`の`:root`にまとめています。`app/globals.css`が元の順番で読み込むので、新しいスタイルは該当するファイルに追加し、読み込み順は変えないでください。
- `supabase/schema.sql`：データベースの定義（新規セットアップ用）。`supabase/migrations/`：既存環境向けの差分。

## データのバックアップと復元

画面右上の「その他」メニューから操作します。

- **エクスポート（全データ）**：企業・選考・予定・ES設問・ESメモ・面接メモを、1つのJSONファイルに書き出します。各データのIDも含むため、復元後も企業と予定・メモの紐付けが保たれます。
- **インポート（復元）**：エクスポートしたファイルを読み込みます。復元は1回のデータベース処理として実行し、途中でエラーが出た場合は何も追加されません。すでに同じIDのデータがある場合はそのまま残し、ないものだけを追加します。同じファイルを2回復元しても、データが重複することはありません。

以前のバージョンで書き出したファイル（企業の配列）も読み込めます。その場合は、企業と選考を新しいデータとして1件ずつ追加します。

## ログインの保護

パスワードを10回続けて間違えると、その接続元からのログインを15分間制限します。失敗の記録は接続元IPアドレスの代わりにハッシュ値で保存し、24時間で削除します。データベースに接続できない場合は、制限なしでログインできます。

## Forkしたリポジトリで気をつけること

- `.env.local`など、値の入った`.env*`をコミットしない（`.gitignore`で除外済みです）
- `.vercel`をコミットしない
- READMEやIssueに秘密キーを書いていない
- Supabaseの`SUPABASE_SERVICE_ROLE_KEY`をブラウザ側コードで使っていない
- `AUTH_PASSWORD`が推測されにくい文字列になっている

`package.json`には`"private": true`があります。これはnpmパッケージとして誤って公開しないための設定です。GitHubリポジトリをpublicにするかどうかとは別の設定です。

## トラブルシューティング

### ログインできない

`.env.local`またはVercelのEnvironment Variablesに設定した`AUTH_PASSWORD`と、ログイン画面で入力した値が一致しているか確認してください。Vercel側で変更した場合はRedeployが必要です。

「一時的にログインを制限しています」と表示された場合は、15分ほど待ってから正しいパスワードで再度お試しください。すぐに解除したい場合は、SupabaseのSQL Editorで`delete from public.login_attempts;`を実行します。

### 「データを読み込めませんでした」と表示される

画面上部のメッセージに、読み込めなかったデータと原因が表示されます。

- `サーバー設定エラー: ... が設定されていません`と表示される場合は、表示された環境変数（`NEXT_PUBLIC_SUPABASE_URL`または`SUPABASE_SERVICE_ROLE_KEY`）を設定してください。変数名のスペルも確認してください。`.env.local`を変更した場合は開発サーバーを再起動し、Vercelで変更した場合はRedeployしてください。
- `permission denied`と表示される場合は、`SUPABASE_SERVICE_ROLE_KEY`に`anon`キー（Publishable key）を入れていないか確認してください。

### テーブルやカラムがないというエラーが出る

新規セットアップの場合は、SupabaseのSQL Editorで[`supabase/schema.sql`](supabase/schema.sql)を実行できているか確認してください。Table Editorに`companies`や`selections`などのテーブルが並んでいれば実行済みです。

「選考管理のデータベース更新が必要です」と表示される場合は、上記の「既存環境を更新する場合」に従って、未実行のマイグレーションを実行してください。

### Geminiの企業リサーチに失敗する

`GEMINI_API_KEY`が設定されているか確認してください。APIキーの利用制限、課金設定、Google AI Studio側の有効状態も確認してください。

### Vercelでは動かないがローカルでは動く

VercelのEnvironment Variablesにローカルと同じ値が入っているか確認してください。環境変数を追加または変更したあとは、最新のデプロイをRedeployしてください。

## 参考リンク

- [Next.js Documentation](https://nextjs.org/docs)
- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [Vercel Git Deployments](https://vercel.com/docs/git)
- [Supabase Next.js Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase API Keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Google AI Studio](https://aistudio.google.com/)

## ライセンス

[MIT License](LICENSE)
