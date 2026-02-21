// =============================================
// 設定：別リポジトリのindex.jsonのURLに変更してね
// 例: https://raw.githubusercontent.com/ユーザー名/リポジトリ名/main/index.json
// =============================================
const INDEX_URL = "https://raw.githubusercontent.com/Gr3nja/Grenja-crawler/main/index.json";
// =============================================

let searchIndex = [];

// ── index.json を別リポジトリから読み込む ──
async function loadIndex() {
    const statusEl = document.getElementById("index-status");
    try {
        const res = await fetch(INDEX_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        searchIndex = await res.json();
        statusEl.textContent = `${searchIndex.length} ページ読み込み済み`;
    } catch (e) {
        statusEl.textContent = "読み込み失敗";
        console.error("index.json の読み込みに失敗しました:", e);
    }
}

// ── 検索ロジック ──
function search(query) {
    if (!query.trim()) return [];

    const keywords = query.trim().toLowerCase().split(/\s+/);

    return searchIndex
        .map(item => {
            const title = (item.title || "").toLowerCase();
            const url = (item.url || "").toLowerCase();

            // キーワードが何個マッチするかスコア化
            let score = 0;
            for (const kw of keywords) {
                if (title.includes(kw)) score += 3;  // タイトルマッチは重み大
                if (url.includes(kw)) score += 1;
            }
            return { ...item, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);
}

// ── 結果を表示 ──
function renderResults(results, query) {
    const homeView = document.getElementById("home-view");
    const resultsView = document.getElementById("results-view");
    const resultsList = document.getElementById("results-list");
    const noResults = document.getElementById("no-results");
    const metaEl = document.getElementById("results-meta");

    // ホーム非表示 → 結果表示
    homeView.classList.add("hidden");
    resultsView.classList.remove("hidden");

    resultsList.innerHTML = "";
    noResults.classList.add("hidden");

    if (results.length === 0) {
        noResults.classList.remove("hidden");
        metaEl.textContent = `"${query}" の検索結果：0 件`;
        return;
    }

    metaEl.textContent = `"${query}" の検索結果：約 ${results.length} 件`;

    results.forEach((item, i) => {
        const card = document.createElement("div");
        card.className = "result-card";
        card.style.animationDelay = `${i * 30}ms`;

        const urlEl = document.createElement("div");
        urlEl.className = "result-url";
        urlEl.textContent = item.url;

        const titleEl = document.createElement("a");
        titleEl.className = "result-title";
        titleEl.href = item.url;
        titleEl.target = "_blank";
        titleEl.rel = "noopener noreferrer";
        titleEl.textContent = item.title || item.url;

        card.appendChild(urlEl);
        card.appendChild(titleEl);
        resultsList.appendChild(card);
    });
}

// ── 検索を実行 ──
function doSearch(query) {
    if (!query.trim()) return;
    const results = search(query);
    renderResults(results, query);
    // URLにクエリを反映（ブラウザの戻るボタンで戻れるように）
    history.pushState({ query }, "", `?q=${encodeURIComponent(query)}`);
}

// ── ホームに戻る ──
function goHome() {
    document.getElementById("home-view").classList.remove("hidden");
    document.getElementById("results-view").classList.add("hidden");
    document.getElementById("main-input").value = "";
    history.pushState({}, "", "./");
}

// ── イベント登録 ──
document.addEventListener("DOMContentLoaded", async () => {
    await loadIndex();

    // ホームの検索ボタン
    document.getElementById("main-btn").addEventListener("click", () => {
        doSearch(document.getElementById("main-input").value);
    });

    // ホームのEnterキー
    document.getElementById("main-input").addEventListener("keydown", e => {
        if (e.key === "Enter") doSearch(e.target.value);
    });

    // ロゴクリックでホームに戻る
    document.querySelector(".header-logo").addEventListener("click", e => {
        e.preventDefault();
        goHome();
    });

    // URLパラメータ ?q=xxx があれば起動時に検索
    const params = new URLSearchParams(location.search);
    const q = params.get("q");
    if (q) doSearch(q);
});