const $ = (id) => document.getElementById(id);
const DB_NAME = 'FieldLog_V7_5_DB';
let db, capturedFile = null, pos = { lat: null, lng: null, hStr: "-" };

const req = indexedDB.open(DB_NAME, 1);
req.onupgradeneeded = (e) => e.target.result.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
req.onsuccess = (e) => { db = e.target.result; renderList(); };

// 写真選択
$("photoInput").onchange = (e) => {
    capturedFile = e.target.files[0];
    if(capturedFile) {
        $("statusMsg").textContent = "✅ 写真OK（保存できます）";
        $("statusMsg").style.color = "#00ff00";
    }
};

// 【改善】位置情報・方位の取得（エラーでも止まらないように修正）
$("btnGeo").onclick = async () => {
    $("btnGeo").textContent = "取得中...";
    $("statusMsg").textContent = "位置情報を確認中...";
    
    // iOSの権限許可
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission().catch(()=>{});
    }

    // 方位の監視（一度設定したらページ更新まで有効）
    window.addEventListener('deviceorientationabsolute', (e) => {
        let a = e.webkitCompassHeading || (360 - (e.alpha || 0));
        let deg = (a + (window.orientation || 0) + 360) % 360;
        pos.hStr = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西","北"][Math.round(deg / 22.5) % 16];
        updateGPSUI();
    }, true);

    // GPS取得
    navigator.geolocation.getCurrentPosition(p => {
        pos.lat = p.coords.latitude; 
        pos.lng = p.coords.longitude;
        updateGPSUI();
        $("btnGeo").textContent = "📍 位置・方位を記録";
        $("statusMsg").textContent = "位置取得完了";
    }, (err) => {
        // エラーになっても「保存」を邪魔しない
        console.error(err);
        $("btnGeo").textContent = "📍 位置再試行（失敗）";
        $("statusMsg").textContent = "⚠️GPSが不安定ですが保存は可能です";
        $("statusMsg").style.color = "#ffaa00";
    }, { enableHighAccuracy: true, timeout: 10000 }); // 10秒でタイムアウトさせて詰まりを防止
};

const updateGPSUI = () => {
    $("gpsDisplay").innerHTML = `緯度: ${pos.lat?.toFixed(6) || "-"} <br> 経度: ${pos.lng?.toFixed(6) || "-"} <br> 方位: ${pos.hStr}`;
};

// 【改善】保存処理（写真があれば強制的に保存可能にする）
$("saveBtn").onclick = () => {
    if (!capturedFile) {
        alert("先に「写真を撮る」で写真をセットしてください");
        return;
    }

    // 保存処理の実行
    try {
        const data = {
            date: new Date().toLocaleString(),
            p: $("locationSelect").value || "未設定",
            s: $("subSelect").value || "-",
            i: $("itemSelect").value || "未設定",
            m: $("memo").value || "",
            lat: pos.lat, lng: pos.lng, h: pos.hStr, b: capturedFile
        };

        const tx = db.transaction('logs', 'readwrite');
        const store = tx.objectStore('logs');
        store.add(data);

        tx.oncomplete = () => {
            $("statusMsg").textContent = "💾 保存しました！";
            $("statusMsg").style.color = "#00ff00";
            // 次の撮影のためにリセット
            capturedFile = null;
            $("photoInput").value = ""; 
            renderList();
            setTimeout(() => $("statusMsg").textContent = "", 3000);
        };

        tx.onerror = () => {
            alert("保存エラーが発生しました。");
        };
    } catch (e) {
        alert("保存ボタンが動かなくなりました。恐れ入りますが、一度このまま「位置・方位を記録」を押し直してみてください。");
    }
};

// 履歴表示などは変更なし
function renderList() {
    db.transaction('logs').objectStore('logs').getAll().onsuccess = (e) => {
        const all = e.target.result.reverse();
        const fL = $("filterLoc").value, fI = $("filterItem").value;
        const filtered = all.filter(r => (!fL || r.p === fL) && (!fI || r.i === fI));
        
        const upSel = (el, list, def) => {
            const val = el.value;
            el.innerHTML = `<option value="">${def}</option>` + [...new Set(list)].map(v => `<option value="${v}">${v}</option>`).join("");
            el.value = val;
        };
        upSel($("filterLoc"), all.map(r => r.p), "全ての地点");
        upSel($("filterItem"), all.map(r => r.i), "全ての項目");

        $("listBody").innerHTML = filtered.map(r => `<tr><td>${r.p}</td><td>${r.s}</td><td>${r.i}</td><td>${r.lat?'ok':'-'}</td><td><button onclick="vImg(${r.id})">◯</button></td></tr>`).join("");
    };
}
$("filterLoc").onchange = $("filterItem").onchange = renderList;
window.vImg = (id) => db.transaction('logs').objectStore('logs').get(id).onsuccess = (e) => {
    if(e.target.result.b) window.open(URL.createObjectURL(e.target.result.b));
};
$("exportBtn").onclick = () => {
    db.transaction('logs').objectStore('logs').getAll().onsuccess = (e) => {
        const zip = new JSZip();
        let csv = "\ufeff日時,地点,小区分,項目,緯度,経度,方位,備考\n";
        e.target.result.forEach(r => {
            csv += `${r.date},${r.p},${r.s},${r.i},${r.lat},${r.lng},${r.h},${r.m}\n`;
            if(r.b) zip.file(`${r.p}/IMG_${r.id}.jpg`, r.b);
        });
        zip.file("data.csv", csv);
        zip.generateAsync({type:"blob"}).then(b => {
            const a = document.createElement("a"); a.href=URL.createObjectURL(b); a.download="Log.zip"; a.click();
        });
    };
};
$("clearAllBtn").onclick = () => { if(confirm("消去？")) db.transaction('logs','readwrite').objectStore('logs').clear().oncomplete = renderList; };
