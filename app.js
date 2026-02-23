const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = "-";

// 1. データベース準備 (listsストアを必ず作成)
const req = indexedDB.open("offline_field_log_v6", 1);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains("surveys")) d.createObjectStore("surveys", { keyPath: "id", autoIncrement: true });
    if (!d.objectStoreNames.contains("lists")) d.createObjectStore("lists", { keyPath: "id" });
};
req.onsuccess = (e) => { 
    db = e.target.result; 
    renderTable(); 
    loadLists(); // セレクトボックスの選択肢を読み込む
};

// 2. 選択肢リスト（地点など）の読み込み機能
function loadLists() {
    const tx = db.transaction("lists", "readonly");
    tx.objectStore("lists").getAll().onsuccess = (e) => {
        const data = e.target.result;
        // 地点、小区分、項目のリストを更新
        updateSelect("selLocation", data.filter(d => d.type === "location"));
        updateSelect("selSubLocation", data.filter(d => d.type === "subLocation"));
        updateSelect("selItem", data.filter(d => d.type === "item"));
    };
}

function updateSelect(id, items) {
    const sel = $(id);
    const originalText = sel.options[0].text;
    sel.innerHTML = `<option value="">${originalText}</option>`;
    items.forEach(item => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = item.name;
        sel.appendChild(opt);
    });
}

// 3. センサー機能
function getGPS() {
    navigator.geolocation.getCurrentPosition(p => {
        currentGeo = p;
        if($("lat")) $("lat").textContent = p.coords.latitude.toFixed(6);
        if($("lng")) $("lng").textContent = p.coords.longitude.toFixed(6);
    }, (e) => alert("GPS取得失敗"), {enableHighAccuracy:true});
}

// 4. イベント割り当て
window.onload = () => {
    $("btnGeo").onclick = async () => {
        if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
            await DeviceOrientationEvent.requestPermission().catch(e=>console.log(e));
        }
        getGPS();
        window.addEventListener('deviceorientationabsolute', (e) => {
            let a = e.webkitCompassHeading || (360 - (e.alpha || 0));
            const dirs = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西"];
            currentHeading = dirs[Math.round(a / 22.5) % 16];
            if($("heading")) $("heading").textContent = currentHeading;
        }, true);
    };

    $("photoInput").onchange = (e) => { currentFile = e.target.files[0]; };

    $("btnSave").onclick = () => {
        if(!currentFile) return alert("写真を撮影してください");
        const data = {
            date: new Date().toLocaleString(),
            location: $("selLocation").value || "未設定",
            subLocation: $("selSubLocation").value || "-",
            item: $("selItem").value || "未設定",
            memo: $("memo").value || "",
            lat: currentGeo ? currentGeo.coords.latitude : "-",
            lng: currentGeo ? currentGeo.coords.longitude : "-",
            heading: currentHeading,
            photoBlob: currentFile
        };
        const tx = db.transaction("surveys", "readwrite");
        tx.objectStore("surveys").add(data).onsuccess = () => {
            alert("💾 保存完了");
            currentFile = null;
            renderTable();
        };
    };

    $("btnDownloadAll").onclick = () => exportZip();
    $("btnDeleteAll").onclick = () => {
        if(confirm("全消去しますか？")) db.transaction("surveys","readwrite").objectStore("surveys").clear().oncomplete = renderTable;
    };
};

// 5. 履歴表示とフィルタ生成
function renderTable() {
    if(!db) return;
    db.transaction("surveys").objectStore("surveys").getAll().onsuccess = (e) => {
        const all = e.target.result.reverse();
        const list = $("list");
        if(!list) return;

        if(!$("fArea")) {
            const div = document.createElement("div"); div.id = "fArea"; div.style = "display:flex; gap:5px; margin-bottom:10px;";
            div.innerHTML = `<select id="fLoc" style="flex:1; padding:8px; background:#222; color:#fff; border:1px solid #444; border-radius:8px;"><option value="">地点</option></select>
                             <select id="fItem" style="flex:1; padding:8px; background:#222; color:#fff; border:1px solid #444; border-radius:8px;"><option value="">項目</option></select>`;
            list.parentNode.insertBefore(div, list);
            $("fLoc").onchange = $("fItem").onchange = renderTable;
        }

        const updateOpt = (id, key, label) => {
            const s = $(id); const val = s.value;
            const opts = [...new Set(all.map(d => d[key]))].filter(v => v && v !== "-");
            s.innerHTML = `<option value="">${label}</option>` + opts.map(v => `<option value="${v}">${v}</option>`).join("");
            s.value = val;
        };
        updateOpt("fLoc", "location", "全ての地点");
        updateOpt("fItem", "item", "全ての項目");

        const fL = $("fLoc").value, fI = $("fItem").value;
        const filtered = all.filter(r => (!fL || r.location === fL) && (!fI || r.item === fI));

        let html = `<tr><th>地点</th><th>項目</th><th>GPS</th><th>写真</th></tr>`;
        filtered.forEach(r => {
            html += `<tr><td>${r.location}</td><td>${r.item}</td><td>${r.lat!=='-'?'ok':'-'}</td>
                     <td><button onclick="vImg(${r.id})" style="background:#00bb55; color:white; border:none; padding:5px 10px; border-radius:5px;">◯</button></td></tr>`;
        });
        list.innerHTML = html;
    };
}

// 6. 写真表示 (オフライン・iPhone対応)
window.vImg = (id) => {
    db.transaction("surveys", "readonly").objectStore("surveys").get(id).onsuccess = (e) => {
        const d = e.target.result;
        if (d && d.photoBlob) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const win = window.open("");
                win.document.write(`<html><body style="margin:0;background:#000;"><img src="${event.target.result}" style="width:100%;"></body></html>`);
            };
            reader.readAsDataURL(d.photoBlob);
        }
    };
};

// 7. ZIP書き出し (ローカルJSZip使用)
function exportZip() {
    if (typeof JSZip === "undefined") return alert("jszip.min.js が見つかりません。");
    db.transaction("surveys").objectStore("surveys").getAll().onsuccess = (e) => {
        const all = e.target.result;
        const zip = new JSZip();
        let csv = "\ufeff日時,地点,小区分,項目,緯度,経度,方位,備考\n";
        all.forEach(r => {
            csv += `${r.date},${r.location},${r.subLocation},${r.item},${r.lat},${r.lng},${r.heading},${r.memo}\n`;
            if(r.photoBlob) zip.file(`photos/IMG_${r.id}.jpg`, r.photoBlob);
        });
        zip.file("data.csv", csv);
        zip.generateAsync({type:"blob"}).then(b => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(b);
            a.download = "FieldLog_Data.zip";
            a.click();
        });
    };
}
