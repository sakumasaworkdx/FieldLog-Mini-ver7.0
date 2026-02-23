const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = "-";
let currentSortCol = 'id', isSortAsc = false;

// 1. JSZipの読み込み (v3継承)
if (typeof JSZip === "undefined") {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(s);
}

// 2. データベース準備 (v3継承)
const req = indexedDB.open("offline_field_log_v6", 1);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains("surveys")) d.createObjectStore("surveys", { keyPath: "id", autoIncrement: true });
};
req.onsuccess = (e) => { db = e.target.result; renderTable(); };

// 3. GPS・方位の常時監視 (v3の「フリーズしない」方式)
// ボタンを押した時ではなく、常に裏で動かしておくことで「保存ボタンの詰まり」を防ぎます
navigator.geolocation.watchPosition(p => {
    currentGeo = p;
    updateGPSUI();
}, (e) => console.warn("GPS取得待ち..."), { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 });

window.addEventListener('deviceorientationabsolute', (e) => {
    let a = e.webkitCompassHeading || (360 - (e.alpha || 0));
    const directions = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
    currentHeading = directions[Math.round(a / 22.5) % 16];
    updateGPSUI();
}, true);

function updateGPSUI() {
    if ($("lat")) $("lat").textContent = currentGeo ? currentGeo.coords.latitude.toFixed(6) : "-";
    if ($("lng")) $("lng").textContent = currentGeo ? currentGeo.coords.longitude.toFixed(6) : "-";
    if ($("heading")) $("heading").textContent = currentHeading;
}

// 4. 写真選択
$("photoInput").onchange = (e) => {
    currentFile = e.target.files[0];
    // 写真がセットされたら、保存ボタンが押せる期待感を出すために通知
    if(currentFile) {
        const msg = $("statusMsg") || alert; 
        console.log("写真セット完了");
    }
};

// 5. 【改善】保存ボタン（GPSが未確定でも、エラーを出さずに即座に保存処理へ入る）
$("btnSave").onclick = () => {
    if (!currentFile) {
        alert("📷 写真を先に撮影してください");
        return;
    }

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

    // 保存処理中にボタンを連打できないようにしつつ、IndexedDBへ書き込み
    const tx = db.transaction("surveys", "readwrite");
    const store = tx.objectStore("surveys");
    
    try {
        store.add(data);
        tx.oncomplete = () => {
            alert("💾 保存しました");
            currentFile = null;
            $("photoInput").value = ""; // 入力をリセット
            renderTable(); // 履歴を更新
        };
    } catch (err) {
        alert("保存中にエラーが発生しました。一度「位置情報を記録」ボタンがある場合はそちらを押して反応を見てください。");
    }
};

// 6. 【新機能】フィルタ機能の追加（index.htmlを書き換えずにJSで動的に追加）
function renderTable() {
    db.transaction("surveys").objectStore("surveys").getAll().onsuccess = (e) => {
        const allData = e.target.result.reverse();
        
        // フィルタ用のUIがなければ作成（表の直前に挿入）
        if (!$("filterArea")) {
            const filterDiv = document.createElement("div");
            filterDiv.id = "filterArea";
            filterDiv.innerHTML = `
                <div style="display:flex; gap:5px; margin-bottom:10px;">
                    <select id="fLoc" style="flex:1; padding:8px; background:#222; color:#fff; border-radius:5px;"><option value="">全ての地点</option></select>
                    <select id="fItem" style="flex:1; padding:8px; background:#222; color:#fff; border-radius:5px;"><option value="">全ての項目</option></select>
                </div>`;
            $("list").parentNode.insertBefore(filterDiv, $("list"));
            $("fLoc").onchange = $("fItem").onchange = renderTable;
        }

        // フィルタの選択肢を更新
        const updateOpt = (id, key, label) => {
            const sel = $(id);
            const val = sel.value;
            const opts
