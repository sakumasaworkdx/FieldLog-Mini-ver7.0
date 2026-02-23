const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = "-";

// 1. DB準備 (v3の名前と構造に完全一致)
const req = indexedDB.open("offline_field_log_v6", 1);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains("surveys")) d.createObjectStore("surveys", { keyPath: "id", autoIncrement: true });
};
req.onsuccess = (e) => { 
    db = e.target.result; 
    renderTable(); 
    // 起動時に監視開始
    startGlobalTracking();
};

// 2. 監視機能 (フリーズ防止のため、関数として独立)
function startGlobalTracking() {
    navigator.geolocation.watchPosition(p => {
        currentGeo = p;
        updateGPSUI();
    }, (e) => console.log("GPS待機"), { enableHighAccuracy: true });

    // 方位（iPhone用）
    const handleOri = (e) => {
        let a = e.webkitCompassHeading || (360 - (e.alpha || 0));
        const directions = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
        currentHeading = directions[Math.round(a / 22.5) % 16];
        updateGPSUI();
    };
    window.addEventListener('deviceorientationabsolute', handleOri, true);
}

function updateGPSUI() {
    if ($("lat")) $("lat").textContent = currentGeo ? currentGeo.coords.latitude.toFixed(6) : "-";
    if ($("lng")) $("lng").textContent = currentGeo ? currentGeo.coords.longitude.toFixed(6) : "-";
    if ($("heading")) $("heading").textContent = currentHeading;
}

// 3. 各ボタンの動作 (v3のIDに完全準拠)

// 写真選択
$("photoInput").onchange = (e) => {
    currentFile = e.target.files[0];
};

// 【重要】保存ボタンの修正 (v3のID: btnSave)
// 内部エラーで止まらないようtry-catchを導入
$("btnSave").onclick = async () => {
    // iPhoneで方位が止まっている場合、ここで再許可を試みる
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission().catch(e => console.log(e));
    }

    if (!currentFile) {
        alert("写真を撮影してください");
        return;
    }

    try {
        const data = {
            date: new Date().toLocaleString(),
            location: $("selLocation").value || "未設定",
            subLocation: $("selSubLocation").value || "-",
            item: $("selItem").value || "未設定",
            memo: $("memo").value || "",
            lat: currentGeo ? currentGeo.coords.latitude : "-",
            lng: currentGeo ? currentGeo.coords.longitude : "-",
            heading: currentHeading || "-",
            photoBlob: currentFile
        };

        const tx = db.transaction("surveys", "readwrite");
        tx.objectStore("surveys").add(data).onsuccess = () => {
            alert("💾 保存しました");
            currentFile = null;
            $("photoInput").value = ""; 
            renderTable();
        };
    } catch (e) {
        alert("保存エラー: ページを一度更新してください。");
    }
};

// 4. フィルタ機能の動的追加 (v3のUIを壊さず、JSだけで追加)
function renderTable() {
    db.transaction("surveys").objectStore("surveys").getAll().onsuccess = (e) => {
        const allData = e.target.result.reverse();
        
        // フィルタUIが無ければ、テーブルの直前に作る
        const listEl = $("list");
        if (!$("filterArea") && listEl) {
            const fDiv = document.createElement("div");
            fDiv.id = "filterArea";
            fDiv.style = "display:flex; gap:5px; margin-bottom:10px;";
            fDiv.innerHTML = `
                <select id="fLoc" style="flex:1; padding:10px; background:#222; color:#fff; border:1px solid #444; border-radius:8px;"><option value="">地点</option></select>
                <select id="fItem" style="flex:1; padding:10px; background:#222; color:#fff; border:1px solid #444; border-radius:8px;"><option value="">項目</option></select>
            `;
            listEl.parentNode.insertBefore(fDiv, listEl);
            $("fLoc").onchange = $("fItem").onchange = renderTable;
        }

        // フィルタ選択肢の更新
        if ($("fLoc")) {
            const updateOpt = (id, key, label) => {
                const s = $(id); const val = s.value;
                const opts = [...new Set(allData.map(d => d[key]))].filter(v => v && v !== "-");
                s.innerHTML = `<option value="">${label}</option>` + opts.map(v => `<option value="${v}">${v}</option>`).join("");
                s.value = val;
            };
            updateOpt("fLoc", "location", "全ての地点");
            updateOpt("fItem", "item", "全ての項目");
        }

        // フィルタリング
        const fL = $("fLoc") ? $("fLoc").value : "";
        const fI = $("fItem") ? $("fItem").value : "";
        const filtered = allData.filter(d => (!fL || d.location === fL) && (!fI || d.item === fI));

        // テーブル描画
        let html = `<tr><th>地点</th><th>項目</th><th>GPS</th><th>写真</th></tr>`;
        filtered.forEach(r => {
            const gps = (r.lat !== "-") ? "ok" : "-";
            const btn = r.photoBlob ? `<button onclick="vImg(${r.id})" style="background:#00bb55; color:white; border:none; padding:5px 10px; border-radius:5px;">◯</button>` : "-";
            html += `<tr><td>${r.location}</td><td>${r.item}</td><td style="text-align:center">${gps}</td><td style="text-align:center">${btn}</td></tr>`;
        });
        listEl.innerHTML = html;
    };
}

// 写真表示
window.vImg = (id) => {
    db.transaction("surveys").objectStore("surveys").get(id).onsuccess = (e) => {
        if(e.target.result.photoBlob) window.open(URL.createObjectURL(e.target.result.photoBlob));
    };
};

// 5. ダウンロード・全削除 (v3のID: btnDownloadAll, btnDeleteAll)
if($("btnDownloadAll")) $("btnDownloadAll").onclick = () => {
    db.transaction("surveys").objectStore("surveys").getAll().onsuccess = (e) => {
        const zip = new JSZip();
        let csv = "\ufeff日時,地点,小区分,項目,緯度,経度,方位,備考\n";
        e.target.result.forEach(r => {
            csv += `${r.date},${r.location},${r.subLocation},${r.item},${r.lat},${r.lng},${r.heading},${r.memo}\n`;
            if(r.photoBlob) zip.file(`IMG_${r.id}.jpg`, r.photoBlob);
        });
        zip.file("data.csv", csv);
        zip.generateAsync({type:"blob"}).then(b => {
            const a = document.createElement("a"); a.href=URL.createObjectURL(b); a.download="FieldLog.zip"; a.click();
        });
    };
};
if($("btnDeleteAll")) $("btnDeleteAll").onclick = () => { if(confirm("全て削除しますか？")) db.transaction("surveys","readwrite").objectStore("surveys").clear().oncomplete = renderTable; };
