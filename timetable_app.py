# -*- coding: utf-8 -*-
"""
App A – Tokyu Departure Board WebApp
FULL SOURCE rev-2025-05-06  (timetable_data 対応版)

機能
──────────────────────────────────────────
▪ 発車案内   (Excel ➜ walk/run advice)
▪ 天気       Tsukumijima Weather JSON FULL（3日分）
▪ ニュース   NHK RSS + Google News
▪ 運行情報   Tokyu scrape + ODPT → 各社平常 or 異常のみ（日本語路線名＋ロゴ付き）
──────────────────────────────────────────
"""

from __future__ import annotations
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
import html
import requests
import pandas as pd
import feedparser
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template

# ──────────────────────────────────────────
#  ディレクトリ・ファイルパス定義
# ──────────────────────────────────────────
BASE_DIR   = Path(__file__).resolve().parent              # timetable-app/
DATA_DIR   = BASE_DIR / "timetable_data"                  # ★ Excel 置き場
STATIC_DIR = BASE_DIR / "static"                          # 画像・CSS・JS

# Excel ファイル
timetable_file      = DATA_DIR / "timetable.xlsx"
bus_timetable_file  = DATA_DIR / "timetablebus.xlsx"
bus_timetable_file2 = DATA_DIR / "timetablebus2.xlsx"
bus_timetable_file3 = DATA_DIR / "timetablebus3.xlsx"

# Flask アプリ
app = Flask(__name__, static_folder=str(STATIC_DIR), template_folder="templates")

# ──────────────────────────────────────────
#  ユーティリティ
# ──────────────────────────────────────────
def fetch_schedule_from_excel(sheet: str, col: str, path: Path) -> list[str]:
    """鉄道時刻表: 『○時台』『××分発』パターンを HH:MM 文字列に整形"""
    df = pd.read_excel(path, sheet_name=sheet)
    out, hour = [], None
    for _, row in df.iterrows():
        if pd.isna(row[col]):
            continue
        cell = str(row[col]).strip()
        if "時台" in cell:
            hour = cell.replace("時台", "").strip()
        elif "分発" in cell and hour:
            minute = "".join(filter(str.isdigit, cell.split("分発")[0]))
            if hour.isdigit() and minute.isdigit():
                out.append(f"{hour.zfill(2)}:{minute.zfill(2)}")
    return out


def fetch_bus_schedule(sheet: str, col: str, path: Path) -> list[str]:
    """バス時刻表（行方向：時、列方向：分）を HH:MM リストで返す"""
    df = pd.read_excel(path, sheet_name=sheet)
    if "時" not in df.columns:
        df.rename(columns={df.columns[0]: "時"}, inplace=True)
    if col not in df.columns:
        col = df.columns[1]
    out = []
    for _, row in df.iterrows():
        h = str(row["時"]).strip()
        if not h.isdigit() or pd.isna(row[col]):
            continue
        for m in str(row[col]).split():
            if m.isdigit():
                out.append(f"{h.zfill(2)}:{m.zfill(2)}")
    return out


def sheet_name(kind: str, key: str | None = None) -> str:
    """曜日判定してシート名を返すヘルパ"""
    wd = datetime.now().weekday()
    if kind == "train":
        return ("平日", "土曜", "日休日")[0 if wd < 5 else 1 if wd == 5 else 2]
    if kind in ("bus", "bus_2"):
        return f"{'平日' if wd < 5 else '土休日'}_{key}"
    if kind == "bus_3":
        if wd < 5:
            return f"平日_{key}"
        if wd == 5:
            return f"土曜_{key}"
        return f"日休日_{key}"
    raise ValueError("kind error")


def remaining(dep_time: str) -> timedelta:
    """HH:MM 形式 ➜ 出発までの残り time delta"""
    now = datetime.now()
    dep = datetime.strptime(dep_time, "%H:%M").replace(year=now.year, month=now.month, day=now.day)
    if dep < now:
        dep += timedelta(days=1)
    return dep - now


# ──────────────────────────────────────────
#  発車案内ルート定義
# ──────────────────────────────────────────
ROUTES = [
    dict(
        label="東急大井町線　尾山台駅",
        type="train",
        file=timetable_file,
        directions=[
            dict(column="大井町方面", sheet_direction=None),
            dict(column="溝の口方面", sheet_direction=None),
        ],
        max=3,
        walk=14,
        run=10,
    ),
    dict(
        label="玉11　東京都市大学南入口",
        type="bus",
        file=bus_timetable_file,
        directions=[
            dict(column="多摩川駅方面", sheet_direction="多摩川"),
            dict(column="二子玉川駅方面", sheet_direction="二子玉川"),
        ],
        max=2,
        walk=7,
        run=5,
    ),
    dict(
        label="園02　東京都市大学北入口",
        type="bus_3",
        file=bus_timetable_file3,
        directions=[
            dict(column="千歳船橋駅方面", sheet_direction="千歳船橋"),
            dict(column="田園調布方面", sheet_direction="田園調布"),
        ],
        max=2,
        walk=7,
        run=5,
    ),
    dict(
        label="等01　東京都市大学前",
        type="bus_2",
        file=bus_timetable_file2,
        directions=[
            dict(column="等々力循環", sheet_direction="等々力"),
        ],
        max=2,
        walk=7,
        run=5,
    ),
]


# ──────────────────────────────────────────
#  API: 発車案内
# ──────────────────────────────────────────
@app.route("/api/schedule")
def api_schedule():
    labs = ["先発", "次発", "次々発"]
    res = {"current_time": datetime.now().strftime("%H:%M:%S"), "routes": []}

    for r in ROUTES:
        travel = "(所要時間:15分)" if r["type"] == "train" else "(所要時間:10分)"
        label = f"{r['label']} {travel}"
        ent = {"label": label}
        mp = {}

        for d in r.get("directions", []):
            sh = sheet_name(r["type"], d.get("sheet_direction"))
            lst = (
                fetch_schedule_from_excel
                if r["type"] == "train"
                else fetch_bus_schedule
            )(sh, d["column"], r["file"])

            show, cnt = [], 0
            for t in lst:
                if cnt >= r["max"]:
                    break
                rm = remaining(t)
                if not (0 < rm.total_seconds() < 3600):
                    continue
                mins = rm.seconds // 60
                if mins < r["run"]:
                    continue
                adv = "歩けば間に合います" if mins >= r["walk"] else "走れば間に合います"
                show.append(f"{labs[cnt]}: {t} 発 - {mins}分 {adv}")
                cnt += 1
            mp[d["column"]] = show
        ent["schedules"] = mp
        res["routes"].append(ent)

    return jsonify(res)


# ──────────────────────────────────────────
#  API: 天気情報
# ──────────────────────────────────────────
W_URL = "https://weather.tsukumijima.net/api/forecast/city/130010"


def get_weather() -> dict:
    try:
        return requests.get(W_URL, timeout=6).json()
    except Exception as e:
        print("Weather error:", e)
        return {}


@app.route("/api/weather")
def api_weather():
    return jsonify(get_weather())


# ──────────────────────────────────────────
#  API: ニュース
# ──────────────────────────────────────────
NHK = "https://www3.nhk.or.jp/rss/news/cat0.xml"
GGL = "https://news.google.com/rss/search?q=東急&hl=ja&gl=JP&ceid=JP:ja"


def get_news() -> list[str]:
    out, seen = [], set()
    for url in (NHK, GGL):
        try:
            feed = feedparser.parse(url)
            for e in feed.entries[:5]:
                t = html.unescape(e.title)
                if t not in seen:
                    out.append(t)
                    seen.add(t)
                if len(out) >= 10:
                    break
        except Exception:
            pass
    return out


@app.route("/api/news")
def api_news():
    return jsonify({"news": get_news()})


# ──────────────────────────────────────────
#  API: 運行情報 (Tokyu + ODPT)
# ──────────────────────────────────────────
TOKYU_URL = "https://www.tokyu.co.jp/unten2/unten.html"
CK = "krlf019vch8i8s1qghthm0bingkmxufic5uz2egbhd55mt86gxg3afxvio1z5zbg"
OPS = {
    "東京メトロ": "odpt.Operator:TokyoMetro",
    "都営地下鉄": "odpt.Operator:Toei",
    "多摩モノレール": "odpt.Operator:TamaMonorail",
    "りんかい線": "odpt.Operator:TWR",
    "TX": "odpt.Operator:MIR",
    "横浜市交通局": "odpt.Operator:YokohamaMunicipal",
}

RAIL_NAME_MAP = {
    "Fukutoshin": "副都心線",
    "Namboku": "南北線",
    "Hanzomon": "半蔵門線",
    "Yurakucho": "有楽町線",
    "Chiyoda": "千代田線",
    "Tozai": "東西線",
    "Hibiya": "日比谷線",
    "Marunouchi": "丸の内線",
    "MarunouchiBranch": "丸の内線方南町支線",
    "Ginza": "銀座線",
    "Asakusa": "浅草線",
    "Mita": "三田線",
    "Shinjuku": "新宿線",
    "Oedo": "大江戸線",
    "Arakawa": "都電荒川線（東京さくらトラム）",
    "NipporiToneri": "日暮里舎人ライナー",
    "TamaMonorail": "多摩モノレール",
    "Rinkai": "りんかい線",
    "TsukubaExpress": "つくばエクスプレス線",
    "Green": "横浜市営地下鉄・グリーンライン",
    "Blue": "横浜市営地下鉄・ブルーライン",
}


@lru_cache(maxsize=None)
def get_line_logos(operator_code: str) -> dict[str, str]:
    """事業者ごとの路線ロゴ（systemMap URL）を dict で返す"""
    url = (
        f"https://api.odpt.org/api/v4/odpt:Railway"
        f"?odpt:operator={operator_code}&acl:consumerKey={CK}"
    )
    try:
        js = requests.get(url, timeout=6).json()
        result: dict[str, str] = {}
        for it in js:
            rc = it.get("odpt:railway", "").split(":")[-1].split(".")[-1]
            logo = it.get("odpt:systemMap")
            if logo:
                result[rc] = logo
        return result
    except Exception as e:
        print(f"Railway API error ({operator_code}):", e)
        return {}


def fetch_tokyu() -> list[str]:
    """東急公式サイトをスクレイプし、異常メッセージのみを返す"""
    try:
        r = requests.get(TOKYU_URL, timeout=6)
        r.encoding = "utf-8"
        soup = BeautifulSoup(r.text, "html.parser")
        msgs: list[str] = []
        for li in soup.select(".service-info li"):
            txt = li.get_text(strip=True)
            if any(w in txt for w in ("平常運転", "通常運転")):
                continue
            tm = li.find("time")
            pre = tm.text.strip() if tm else ""
            msgs.append(f"東急電鉄・{pre}{txt}")
        return msgs
    except Exception as e:
        print("Tokyu scrape error:", e)
        return []


def fetch_odpt() -> list[dict[str, str]]:
    """
    ODPT API から異常情報のみ取得し、
    {"logo": URL or None, "text": "..."} のリストを返す
    """
    base = "https://api.odpt.org/api/v4/odpt:TrainInformation"
    out: list[dict[str, str]] = []

    for op_name, code in OPS.items():
        logos = get_line_logos(code)
        url = f"{base}?odpt:operator={code}&acl:consumerKey={CK}"
        try:
            js = requests.get(url, timeout=6).json()
            for it in js:
                txt = (
                    it.get("odpt:trainInformationText")
                    or it.get("odpt:trainInformationStatus")
                )
                if not txt:
                    continue
                if isinstance(txt, dict):
                    txt = txt.get("ja") or next(iter(txt.values()), "")
                if any(w in txt for w in ("平常運転", "Normal")):
                    continue

                rc = it.get("odpt:railway", "").split(":")[-1].split(".")[-1]
                rail_ja = RAIL_NAME_MAP.get(rc, rc)
                logo = logos.get(rc)
                out.append({"logo": logo, "text": f"{op_name}・{rail_ja}➡{txt}"})
        except Exception as e:
            print(f"ODPT fetch error ({op_name}):", e)

    return out


@app.route("/api/status")
def api_status():
    msgs = fetch_tokyu()
    items: list[dict[str, str]] = [{"logo": None, "text": m} for m in msgs]
    items.extend(fetch_odpt())
    if not items:
        items = [{"logo": None, "text": "各社平常運転です"}]
    return jsonify({"status": items})


# ──────────────────────────────────────────
#  ルート
# ──────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html", page=1)


@app.route("/page/<int:p>")
def index_page(p: int):
    return render_template("index.html", page=p)


# ──────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
