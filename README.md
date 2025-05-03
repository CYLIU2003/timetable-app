# timetable_screen
========================================================================
README.txt

Project : リアルタイム情報ダッシュボード
Repository : https://github.com/CYLIU2003/timetable-app
Author : 劉 承洋（東京都市大学・電気電子通信工学科）
Last Update : 2025‑05‑06
========================================================================
目次
  1. 目的と特徴
  2. フォルダ構成
  3. 必要環境
  4. セットアップ手順
  5. サーバー起動と利用方法
  6. API 仕様（エンドポイント一覧）
  7. よくある質問（FAQ）
  8. カスタマイズガイド
  9. ライセンス
========================================================================


■ 1. 目的と特徴
──────────────────────────────────────────────
本リポジトリは「運行情報・天気・ニュース・発車案内」をまとめて
学内ディスプレイに表示するダッシュボードのサンプル実装です。

● ポイント
  ✓ フロントは純粋な HTML/CSS/JavaScript（フレームワーク不要）
  ✓ バックエンドは Flask 1 ファイルで完結（app.py）
  ✓ 時刻表データは Excel で管理 → pandas で読み込み
  ✓ 設定モーダルからズーム/フォント/テーマ色/カード順を即変更
  ✓ SortableJS によりカードのドラッグ並べ替え対応


■ 2. フォルダ構成
──────────────────────────────────────────────
timetable-app/
├── app.py                  ← Flask サーバースクリプト（本体）
├── timetable_data/         ← ★ Excel や CSV 等の生データ置き場
│   ├── timetable.xlsx          ← 鉄道時刻表
│   ├── timetablebus.xlsx       ← バス時刻表 (例)
│   ├── timetablebus2.xlsx
│   └── timetablebus3.xlsx
├── templates/
│   └── index.html          ← Jinja2 テンプレート
├── static/
│   ├── app.js              ← フロントエンド JS
│   ├── style.css           ← 全体スタイルシート
│   └── img/                ← 路線ロゴ・天気アイコンなど
├── requirements.txt        ← Python 依存パッケージ一覧
└── README.txt              ← 本ドキュメント


■ 3. 必要環境
──────────────────────────────────────────────
- Python 3.8 以上
- Git（リポジトリ取得用）
- 任意で VS Code などのエディタ
- Web ブラウザ（Chrome 推奨）

requirements.txt

    Flask>=2.0
    pandas>=1.5
    openpyxl>=3.0
    requests>=2.28
    feedparser>=6.0
    beautifulsoup4>=4.11


■ 4. セットアップ手順
──────────────────────────────────────────────
① リポジトリを取得
    > git clone https://github.com/CYLIU2003/timetable-app.git
    > cd timetable-app

② 仮想環境を作成・起動
    Windows:
        > python -m venv venv
        > venv\Scripts\activate
    macOS / Linux:
        $ python3 -m venv venv
        $ source venv/bin/activate

③ 依存パッケージをインストール
    (venv) $ pip install -r requirements.txt

④ Excel ファイルを timetable_data/ に配置
    └ timetable.xlsx などが存在しないと /api/schedule で 404 が返ります

⑤ 静的画像ファイルを static/img/ に配置
    └ ファイル名は static/app.js の ICON_MAP に合わせる

⑥ サーバー起動
    (venv) $ python app.py
    └ ブラウザで http://localhost:5000 を開く


■ 5. サーバー起動と利用方法
──────────────────────────────────────────────
- 起動するとコンソールに
      * Running on http://127.0.0.1:5000/ (Press CTRL+C to quit)
  が表示されます。
- ブラウザでアクセスすると、時刻表カード・運行情報カードなどが
  自動更新されるダッシュボードが表示されます。
- 右上の「⚙️」ボタンから設定モーダルを開き、ズーム倍率やテーマ色を
  試してみてください。


■ 6. API 仕様（エンドポイント一覧）
──────────────────────────────────────────────
| URL                | 概要            | 実装箇所        |
|--------------------|-----------------|-----------------|
| /api/status        | 運行情報        | app.py:api_status |
| /api/weather       | 天気予報        | app.py:api_weather |
| /api/news          | ニュース見出し  | app.py:api_news |
| /api/schedule      | 発車案内        | app.py:api_schedule |
| /img/<filename>    | 画像リソース    | app.py:img        |

※ 天気・ニュースの外部 API キーが必要な場合は app.py を編集してください。


■ 7. よくある質問（FAQ）
──────────────────────────────────────────────
Q1. 画面が真っ白です。  
A1. F12 → Console にエラーが出ていないか確認してください。  
    - ICON_MAP の配列化漏れが原因で `forEach is not a function` が
      よく発生します。

Q2. Excel を置き換えたら時刻表が更新されません。  
A2. サーバーを再起動（Ctrl+C → python app.py）してキャッシュをクリア
    (ブラウザで Ctrl+F5) してください。

Q3. ポート 5000 が他と競合します。  
A3. `python app.py` の代わりに  
       `flask run --port=5001`  
    など好きなポート番号を指定してください。


■ 8. カスタマイズガイド
──────────────────────────────────────────────
・新しい路線ロゴの追加  
    1) static/img/ に画像を保存  
    2) static/app.js の ICON_MAP に `"路線名":["ファイル名.png"],` を追加  
    3) ブラウザをリロード

・天気 API を別サービスへ変更  
    app.py の api_weather() を編集し、JSON 返却形式をフロントに合わせる

・カードを固定して動かしたくない  
    static/app.js の SortableJS 初期化をコメントアウトする


■ 9. ライセンス
──────────────────────────────────────────────
MIT License  
Copyright (c) 2025 CY LIU

========================================================================
Enjoy your dashboard!  ご不明点は Issues か Pull‑Request でお知らせください。
========================================================================
