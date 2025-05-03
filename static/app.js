// app.js – 2025-05-08 FULL (運行情報・天気・ニュース・発車案内・設定 UI すべて含む)
document.addEventListener("DOMContentLoaded", () => {

    /* ─────────── DOM ヘルパ ─────────── */
    const $  = id  => document.getElementById(id);
    const $$ = sel => document.querySelector(sel);
  
    /* ─────────── 共通 fetch (JSON) ─────────── */
    const jFetch = (url, opts) => fetch(url, opts).then(r => r.json());
  
    /* ─────────── 設定 UI 要素 ─────────── */
    const zoomSl    = $("zoom-slider");
    const fontSl    = $("font-slider");
    const resizeChk = $("resize-toggle");
    const zoomVal   = $("zoom-value");
    const fontVal   = $("font-value");
  
    const btnSet   = $("settings-button");
    const modal    = $("settings-modal");
    const btnClose = $("close-settings");
  
    const toggles = {
      status   : $("toggle-status"),
      weather  : $("toggle-weather"),
      news     : $("toggle-news"),
      schedule : $("toggle-schedule"),
      twitter  : $("toggle-twitter")
    };
  
    const panels = {
      status   : $("status-card"),
      weather  : $("weather-card"),
      news     : $("news-ticker"),
      schedule : $("routes-container"),
      twitter  : $("twitter-container")
    };
  
    const pickers = {
      statusBg : $("color-status-bg"),   statusText : $("color-status-text"),
      weatherBg: $("color-weather-bg"),  weatherText: $("color-weather-text"),
      newsBg   : $("color-news-bg"),     newsText   : $("color-news-text"),
      schedBg  : $("color-schedule-bg"), schedText  : $("color-schedule-text"),
      fontFam  : $("font-family-select")
    };
  
    const routeBox = $("route-selector-container");
  
    /* ─────────── グローバル状態 ─────────── */
    const timers = new Set();          // すべての setInterval ID
    let statusArr = [], statusIdx = 0; // 運行情報
    let newsArr   = [], newsIdx   = -1;// ニュース
    let scheduleJson = {};            // /api/schedule 結果
    let routesInit   = false;         // routeBox 生成済み?
    let showRoutes   = [];            // 表示路線
    let countMap     = {};            // { 路線 : 表示本数 }
  
    /* ─────────── ローカル画像マッピング ─────────── */
    const ICON_MAP = {
      /* 東急電鉄 */
      "大井町線"       : ["OM.png", "OM_1.png"],
      "田園都市線"     : ["DT.png"],
      "東横線"         : ["TY.png"],
      "目黒線"         : ["MG.png"],
      "池上線"         : ["IK.png"],
      "多摩川線"       : ["TM.png"],
      "こどもの国線"   : ["KD.png"],
  
      /* バス */
      "玉11"           : ["tokyu_bus.png"],
      "園02"           : ["tokyu_bus.png"],
      "等01"           : ["tokyu_bus.png"],
  
      /* === 東京メトロ === */
      "丸の内線"               : ["icon_marunouchi.png"],
      "丸の内線方南町支線"     : ["icon_marunouchi.png"],
      "南北線"                 : ["icon_namboku.png"],
      "東西線"                 : ["icon_tozai.png"],
      "有楽町線"               : ["icon_yurakucho.png"],
      "千代田線"               : ["icon_chiyoda.png"],
      "副都心線"               : ["icon_fukutoshin.png"],
      "銀座線"                 : ["icon_ginza.png"],
      "半蔵門線"               : ["icon_hanzomon.png"],
      "日比谷線"               : ["icon_hibiya.png"],
  
      /* === 都営地下鉄 === */
      "浅草線"                 : ["Toei_Asakusa_line_symbol.svg.png"],
      "三田線"                 : ["Toei_Mita_line_symbol.svg.png"],
      "新宿線"                 : ["Toei_Shinjuku_line_symbol.svg.png"],
      "大江戸線"               : ["Toei_Oedo_line_symbol.svg.png"],
  
      /* 都電 */
      "都電荒川線（東京さくらトラム）": ["Toei_Arakawa_line_symbol.svg.png"],
  
      /* 横浜市営地下鉄 */
      "横浜市営地下鉄・グリーンライン": ["icon_green.png"],
      "横浜市営地下鉄・ブルーライン":   ["icon_blue.png"],
  
      /* その他 */
      "りんかい線"             : ["icon_rinkai.png"],
      "つくばエクスプレス線"   : ["icon_tx.png"],
      "多摩モノレール"         : ["icon_tama.png"]
    };
    /* ← 保険：混在文字列があっても強制配列化 */
    for(const k in ICON_MAP){
      if(!Array.isArray(ICON_MAP[k])) ICON_MAP[k] = [ICON_MAP[k]];
    }
  
    /* ─────────── 汎用 ─────────── */
    const imgTag = fn => `<img class="logo" src="/static/img/${fn}" alt="">`;
    const getIcons = label => {
      for(const key in ICON_MAP){
        if(label.includes(key)) return ICON_MAP[key];
      }
      return [];
    };
  
    /* ─────────── 時計 ─────────── */
    function updateClock(){
      const n = new Date();
      $("current-time").textContent = n.toLocaleTimeString("ja-JP",{hour12:false});
      $("current-date").textContent = n.toLocaleDateString("ja-JP",
        {year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"});
    }
  
    /* ============================ 運行情報 ============================ */
    function drawStatus(){
      const ul = $("status-list"); ul.innerHTML = "";
      const it = statusArr[statusIdx] || {logo:null,text:"運行情報取得エラー"};
      const li = document.createElement("li"); li.className = "status-item";
  
      /* 1) API 提供ロゴ */
      if(it.logo){
        li.insertAdjacentHTML("beforeend", `<img class="status-logo" src="${it.logo}">`);
      }else{
        /* 2) ローカル ICON_MAP 補完 */
        getIcons(it.text).forEach(fn=>{
          li.insertAdjacentHTML("beforeend", `<img class="status-logo" src="/static/img/${fn}">`);
        });
      }
      li.appendChild(document.createTextNode(it.text));
      ul.appendChild(li);
    }
  
    function loadStatus(){
      jFetch("/api/status")
        .then(d => {
          statusArr = d.status.length ? d.status
                                      : [{logo:null,text:"各社平常運転です"}];
          statusIdx = 0; drawStatus();
        })
        .catch(()=>{
          statusArr = [{logo:null,text:"運行情報取得エラー"}];
          statusIdx = 0; drawStatus();
        });
    }
  
    /* ============================ 天気 ============================ */
    function drawWeather(d){
      const cont = $("weather-info"); cont.innerHTML = "";
      d.forecasts.slice(0,3).forEach(f=>{
        const div = document.createElement("div"); div.className="forecast-day";
        div.innerHTML = `
          <div class="forecast-date">${f.dateLabel}</div>
          <div class="forecast-main">
            <img src="${f.image.url}" class="forecast-icon">
            <span>${f.telop}</span>
          </div>
          <div class="forecast-rain">降水確率：${f.chanceOfRain.T12_18||"--%"}</div>
          <div class="forecast-wind">風：${f.detail.wind||""}</div>`;
        cont.appendChild(div);
      });
    }
    const loadWeather = () => jFetch("/api/weather").then(drawWeather);
  
    /* ============================ ニュース ============================ */
    function newsCycle(){
      if(!newsArr.length) return;
      newsIdx = (newsIdx+1)%newsArr.length;
      const el = $("news-headline");
      el.style.opacity="0";
      setTimeout(()=>{
        el.textContent = newsArr[newsIdx];
        el.style.opacity="1";
      },200);
    }
    function loadNews(){
      jFetch("/api/news").then(d=>{
        newsArr = d.news||[];
        if(newsIdx<0&&newsArr.length){
          newsIdx=0; $("news-headline").textContent=newsArr[0];
        }
      });
    }
  
    /* ============================ 発車案内 ============================ */
    function buildRouteSelectors(){
      routeBox.innerHTML="";
      showRoutes=[]; countMap={};
      (scheduleJson.routes||[]).forEach(r=>{
        const label=r.label; showRoutes.push(label); countMap[label]=2;
        const line=document.createElement("div"); line.style.marginBottom="4px";
  
        const cb=document.createElement("input");
        cb.type="checkbox"; cb.checked=true; cb.value=label;
        cb.addEventListener("change",()=>{
          showRoutes=Array.from(routeBox.querySelectorAll("input[type=checkbox]:checked"))
                          .map(x=>x.value);
          renderSchedule(scheduleJson);
        });
  
        const num=document.createElement("input");
        num.type="number"; num.min=1; num.max=10; num.value=2;
        num.style.width="50px"; num.style.marginLeft="6px";
        num.addEventListener("input",()=>{
          const v=parseInt(num.value,10);
          countMap[label]=(isNaN(v)||v<1)?1:v; renderSchedule(scheduleJson);
        });
  
        line.appendChild(cb);
        line.appendChild(document.createTextNode(" "+label));
        line.appendChild(num);
        routeBox.appendChild(line);
      });
      routesInit=true;
    }
  
    function renderSchedule(js){
      if(!js.routes) return;
      if(!routesInit) buildRouteSelectors();
  
      const cont=panels.schedule; cont.innerHTML="";
      js.routes.filter(r=>showRoutes.includes(r.label)).forEach(route=>{
        /* ===== カード一枚 ===== */
        const card=document.createElement("section"); card.className="route";
        const wrap=document.createElement("div");   wrap.className="route-wrap";
  
        /* タイトル (ロゴ+路線名) */
        const logoHTML=getIcons(route.label).map(imgTag).join("");
        wrap.innerHTML=`<h2 class="route-title">${logoHTML}${route.label}</h2>`;
  
        /* 時刻リスト */
        const limit=countMap[route.label]||2;
        const pairs=(typeof route.schedules==="object"&&!Array.isArray(route.schedules))
          ? Object.entries(route.schedules)
          : [["",route.schedules]];
  
        const prefixMap={日本語:["先発","次発","次々発"]};
        pairs.forEach(([dirName,list])=>{
          const dir=document.createElement("div"); dir.className="direction";
          if(dirName) dir.innerHTML=`<div class="direction-title">${dirName}</div>`;
          const body=document.createElement("div"); body.className="schedule-list";
  
          list.slice(0,limit).forEach((ln,i)=>{
            const idx=ln.indexOf(":"); const pre=ln.slice(0,idx);
            const rest=ln.slice(idx+1).trim();
            const p=document.createElement("p");
            p.textContent=`${prefixMap.日本語[i]||pre}:${rest}`;
            if(i===0) p.classList.add("first-dep");
            if(i===1) p.classList.add("second-dep");
            body.appendChild(p);
          });
          dir.appendChild(body); wrap.appendChild(dir);
        });
  
        card.appendChild(wrap); cont.appendChild(card);
      });
    }
  
    function loadSchedule(){
      jFetch("/api/schedule").then(js=>{
        scheduleJson=js; renderSchedule(js);
      });
    }
  
    /* ============================ UI バインド ============================ */
    zoomSl.addEventListener("input",()=>{
      document.body.style.zoom=zoomSl.value+"%";
      zoomVal.textContent=zoomSl.value+"%";
    });
    fontSl.addEventListener("input",()=>{
      document.body.style.fontSize=fontSl.value+"%";
      fontVal.textContent=fontSl.value+"%";
    });
    resizeChk.addEventListener("change",()=>{
      document.querySelectorAll(".panel").forEach(el=>{
        el.classList.toggle("resizable-on", resizeChk.checked);
        el.classList.toggle("resizable-off",!resizeChk.checked);
      });
    });
  
    function updateVisibility(){
      for(const k in toggles){
        panels[k].style.display = toggles[k].checked ? "" : "none";
      }
    }
    Object.values(toggles).forEach(el=>el.addEventListener("change",updateVisibility));
  
    function applyColors(){
      panels.status .style.background=pickers.statusBg.value;
      panels.status .style.color      =pickers.statusText.value;
      panels.weather.style.background=pickers.weatherBg.value;
      panels.weather.style.color      =pickers.weatherText.value;
      panels.news   .style.background=pickers.newsBg.value;
      panels.news   .style.color      =pickers.newsText.value;
      panels.schedule.style.background=pickers.schedBg.value;
      panels.schedule.style.color     =pickers.schedText.value;
      document.body.style.fontFamily  =pickers.fontFam.value;
    }
    Object.values(pickers).forEach(el=>{
      el.addEventListener(el.tagName==="SELECT"?"change":"input",applyColors);
    });
  
    btnSet  .addEventListener("click",()=>{modal.classList.add("active"); clearAllTimers();});
    btnClose.addEventListener("click",()=>{modal.classList.remove("active"); startTimers();});
  
    /* ============================ タイマー管理 ============================ */
    function addTimer(id){timers.add(id);}
    function clearAllTimers(){timers.forEach(clearInterval); timers.clear();}
    function startTimers(){
      addTimer(setInterval(updateClock ,1000));
      addTimer(setInterval(()=>{statusIdx=(statusIdx+1)%statusArr.length; drawStatus();},5000));
      addTimer(setInterval(loadStatus  ,60000));
      addTimer(setInterval(loadWeather,600000));
      addTimer(setInterval(loadSchedule,30000));
      addTimer(setInterval(loadNews   ,30000));
      addTimer(setInterval(newsCycle  ,4000));
    }
  
    /* ============================ 初期化 ============================ */
    document.body.style.zoom=zoomSl.value+"%";
    document.body.style.fontSize=fontSl.value+"%";
    resizeChk.dispatchEvent(new Event("change"));
    updateClock();   loadStatus(); loadWeather(); loadSchedule(); loadNews();
    startTimers();
  });
  