const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = "-";

// 1. データベース (v3そのまま)
const req = indexedDB.open("offline_field_log_v6", 1);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains("surveys")) d.createObjectStore("surveys", { keyPath: "id", autoIncrement: true });
};
req.onsuccess = (e) => { db = e.target.result; renderTable(); };

// 2. 位置情報の取得
function getGPS() {
    navigator.geolocation.getCurrentPosition(p => {
        currentGeo = p;
        if($("lat")) $("lat").textContent = p.coords.latitude.toFixed(6);
        if($("lng")) $("lng").textContent = p.coords.longitude.toFixed(6);
    }, (e) => alert("GPSを取得できません。設定を確認してください。"), {enableHighAccuracy:true});
}

// 3. ボタンの動作設定 (v3のIDと要素に完全対応)
window.onload = () => {
    // 位置記録ボタン (label要素)
    if($("btnGeo")) {
        $("btnGeo").onclick = async () => {
            if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
                await DeviceOrientationEvent.requestPermission();
            }
            getGPS(); // 位置取得を実行
            // 方位監視開始
            window.addEventListener('deviceorientationabsolute', (e) => {
                let a = e.webkitCompassHeading || (360 - (e.alpha || 0));
                const dirs = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西"];
                currentHeading = dirs[Math.round(a / 22.5) % 16];
                if($("heading")) $("heading").textContent = currentHeading;
            }, true);
        };
    }

    // 写真選択
    if($("photoInput")) {
        $("photoInput").onchange = (e) => { currentFile = e.target.files[0]; };
    }

    // 保存ボタン (v3そのまま)
    if($("btnSave")) {
        $("btnSave").onclick = () => {
            if(!currentFile) return alert("写真を撮ってください");
            const data = {
                date: new Date().toLocaleString(),
                location: $("selLocation").value,
                subLocation: $("selSubLocation").value,
                item: $("selItem").value,
                memo: $("memo").value,
                lat: currentGeo ? currentGeo.coords.latitude : "-",
                lng: currentGeo ? currentGeo.coords.longitude : "-",
                heading: currentHeading,
                photoBlob: currentFile
            };
            const tx = db.transaction("surveys", "readwrite");
            tx.objectStore("surveys").add(data).onsuccess = () => {
                alert("保存完了");
                currentFile = null;
                renderTable();
            };
        };
    }
};

// フィルタ機能付きの履歴表示
function renderTable() {
    db.transaction("surveys").objectStore("surveys").getAll().onsuccess = (e) => {
        const all = e.target.result.reverse();
        const list = $("list");
        if(!list) return;

        // フィルタUI追加
        if(!$("fArea")) {
            const div = document.createElement("div");
            div.id = "fArea";
            div.style = "display:flex; gap:5px; margin-bottom:10px;";
            div.innerHTML = `
                <select id="fLoc" style="flex:1; padding:8px; background:#222; color:#fff;"><option value="">全ての地点</option></select>
                <select id="fItem" style="flex:1; padding:8px; background:#222; color:#fff;"><option value="">全ての項目</option></select>`;
            list.parentNode.insertBefore(div, list);
            $("fLoc").onchange = $("fItem").onchange = renderTable;
        }

        const fL = $("fLoc").value;
        const fI = $("fItem").value;
        const filtered = all.filter(r => (!fL || r.location === fL) && (!fI || r.item === fI));

        let html = `<tr><th>地点</th><th>項目</th><th>GPS</th><th>写真</th></tr>`;
        filtered.forEach(r => {
            html += `<tr><td>${r.location}</td><td>${r.item}</td><td>${r.lat!=='-'?'ok':'-'}</td><td><button onclick="vImg(${r.id})">◯</button></td></tr>`;
        });
        list.innerHTML = html;
    };
}
window.vImg = (id) => db.transaction("surveys").objectStore("surveys").get(id).onsuccess = (e) => window.open(URL.createObjectURL(e.target.result.photoBlob));
