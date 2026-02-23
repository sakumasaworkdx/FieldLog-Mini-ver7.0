const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = "-";

// データベース準備
const req = indexedDB.open("offline_field_log_v6", 1);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains("surveys")) d.createObjectStore("surveys", { keyPath: "id", autoIncrement: true });
    if (!d.objectStoreNames.contains("lists")) d.createObjectStore("lists", { keyPath: "id", autoIncrement: true });
};
req.onsuccess = (e) => { 
    db = e.target.result; 
    renderTable(); 
    loadLists(); 
};

// CSV読込処理
function handleCSVImport(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split(/\r\n|\n/);
        const locations = new Set(), sub = new Set(), items = new Set();
        lines.forEach((line, i) => {
            if (!line || i === 0) return;
            const cols = line.split(",");
            if (cols.length >= 3) {
                if (cols[0]) locations.add(cols[0].trim());
                if (cols[1]) sub.add(cols[1].trim());
                if (cols[2]) items.add(cols[2].trim());
            }
        });
        const tx = db.transaction("lists", "readwrite");
        const store = tx.objectStore("lists");
        store.clear().onsuccess = () => {
            locations.forEach(v => store.add({ type: "location", name: v }));
            sub.forEach(v => store.add({ type: "subLocation", name: v }));
            items.forEach(v => store.add({ type: "item", name: v }));
        };
        tx.oncomplete = () => { alert("✅ リストを更新しました"); loadLists(); };
    };
    reader.readAsText(file);
}

function loadLists() {
    db.transaction("lists", "readonly").objectStore("lists").getAll().onsuccess = (e) => {
        const data = e.target.result;
        updateSelect("selLocation", data.filter(d => d.type === "location"));
        updateSelect("selSubLocation", data.filter(d => d.type === "subLocation"));
        updateSelect("selItem", data.filter(d => d.type === "item"));
    };
}

function updateSelect(id, items) {
    const sel = $(id); if (!sel) return;
    sel.innerHTML = `<option value="">${sel.options[0].text}</option>`;
    items.forEach(item => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = item.name;
        sel.appendChild(opt);
    });
}

window.onload = () => {
    // ボタンの紐付け
    if($("csvInput")) $("csvInput").onchange = (e) => { if (e.target.files[0]) handleCSVImport(e.target.files[0]); };

    $("btnGeo").onclick = async () => {
        if (typeof DeviceOrientationEvent?.requestPermission === 'function') await DeviceOrientationEvent.requestPermission();
        navigator.geolocation.getCurrentPosition(p => {
            currentGeo = p;
            $("lat").textContent = p.coords.latitude.toFixed(6);
            $("lng").textContent = p.coords.longitude.toFixed(6);
        }, () => alert("GPSエラー"), {enableHighAccuracy:true});
        window.addEventListener('deviceorientationabsolute', (e) => {
            let a = e.webkitCompassHeading || (360 - (e.alpha || 0));
            const dirs = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西"];
            currentHeading = dirs[Math.round(a / 22.5) % 16];
            $("heading").textContent = currentHeading;
        }, true);
    };

    $("photoInput").onchange = (e) => { currentFile = e.target.files[0]; };

    $("btnSave").onclick = () => {
        if(!currentFile) return alert("写真を撮ってください");
        const data = {
            date: new Date().toLocaleString(),
            location: $("selLocation").value,
            subLocation: $("selSubLocation").value,
            item: $("selItem").value,
            memo: $("memo").value,
            lat: $("lat").textContent,
            lng: $("lng").textContent,
            heading: currentHeading,
            photoBlob: currentFile
        };
        db.transaction("surveys", "readwrite").objectStore("surveys").add(data).onsuccess = () => {
            alert("💾 保存完了");
            currentFile = null;
            renderTable();
        };
    };

    // 一括ZIP保存ボタンの動作
    if($("btnDownloadAll")) $("btnDownloadAll").onclick = () => exportZip();
    
    // 全データ消去ボタンの動作
    if($("btnDeleteAll")) $("btnDeleteAll").onclick = () => { 
        if(confirm("保存されているすべてのデータを消去しますか？")) {
            db.transaction("surveys","readwrite").objectStore("surveys").clear().oncomplete = renderTable; 
        }
    };
};

function renderTable() {
    db.transaction("surveys").objectStore("surveys").getAll().onsuccess = (e) => {
        const all = e.target.result.reverse();
        const list = $("list");
        let html = `<tr><th>地点</th><th>項目</th><th>写真</th></tr>`;
        all.forEach(r => {
            html += `<tr><td>${r.location}</td><td>${r.item}</td>
                     <td><button onclick="vImg(${r.id})" style="background:#00bb55; color:white; border:none; padding:5px 10px; border-radius:5px;">◯</button></td></tr>`;
        });
        list.innerHTML = html;
    };
}

window.vImg = (id) => {
    db.transaction("surveys", "readonly").objectStore("surveys").get(id).onsuccess = (e) => {
        const d = e.target.result;
        if (d && d.photoBlob) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const win = window.open("");
                win.document.write(`<html><body style="margin:0;background:#000;"><img src="${ev.target.result}" style="width:100%;"></body></html>`);
            };
            reader.readAsDataURL(d.photoBlob);
        }
    };
}

function exportZip() {
    if (typeof JSZip === "undefined") return alert("jszip.min.jsが読み込まれていません。フォルダにファイルを置いてください。");
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
