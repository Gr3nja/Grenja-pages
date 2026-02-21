// =============================================
// 設定：別リポジトリのindex.csvのURLに変更してね
// 例: https://raw.githubusercontent.com/ユーザー名/リポジトリ名/main/index.csv
// =============================================
const INDEX_URL = "https://raw.githubusercontent.com/Gr3nja/Grenja-crawler/main/index.csv";
// =============================================

let searchIndex = [];
let currentResults = [];
let currentQuery = "";
let currentPage = 1;
const RESULTS_PER_PAGE = 20;

// ── シンプルな CSV パーサ ──
// 1 行目をヘッダとみなし、オブジェクトの配列を返す。
// ダブルクォートで囲まれたカンマや改行、"" のエスケープを処理。
function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let i = 0;
    let inQuotes = false;

    while (i < text.length) {
        const c = text[i];

        if (c === '"') {
            if (inQuotes && text[i + 1] === '"') {
                field += '"';   // "" → "
                i += 2;
                continue;
            }
            inQuotes = !inQuotes;
            i++;
            continue;
        }

        if (c === ',' && !inQuotes) {
            row.push(field);
            field = "";
            i++;
            continue;
        }

        if ((c === '\r' || c === '\n') && !inQuotes) {
            row.push(field);
            field = "";
            rows.push(row);
            row = [];
            if (c === '\r' && text[i + 1] === '\n') i++;
            i++;
            continue;
        }

        field += c;
        i++;
    }

    if (field !== "" || inQuotes) {
        row.push(field);
    }
    if (row.length) rows.push(row);

    if (rows.length === 0) return [];

    const headers = rows.shift().map(h => h.trim());
    return rows.map(r => {
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = r[idx] !== undefined ? r[idx] : "";
        });
        return obj;
    });
}

// ── index.csv を別リポジトリから読み込む ──
async function loadIndex() {
    const statusEl = document.getElementById("index-status");
    try {
        const res = await fetch(INDEX_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        // JSON.parse の代わりに CSV をパース
        searchIndex = parseCSV(text);
        statusEl.textContent = `${searchIndex.length} ページ読み込み済み`;
    } catch (e) {
        statusEl.textContent = "読み込み失敗";
        console.error("index.csv の読み込みに失敗しました:", e);
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

            let score = 0;
            let titleMatchCount = 0;

            for (const kw of keywords) {
                if (title.includes(kw)) {
                    score += 3;
                    titleMatchCount++;
                }
                if (url.includes(kw)) score += 1;
            }

            // 2=全キーワードがタイトルにマッチ / 1=一部マッチ / 0=マッチなし
            const titleTier = titleMatchCount === keywords.length ? 2
                : titleMatchCount > 0 ? 1
                    : 0;

            return { ...item, score, titleTier };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => {
            if (b.titleTier !== a.titleTier) return b.titleTier - a.titleTier;
            return b.score - a.score;
        });
}

// ── 結果を表示 ──
function renderResults(results, query, page = 1) {
    const homeView = document.getElementById("home-view");
    const resultsView = document.getElementById("results-view");
    const resultsList = document.getElementById("results-list");
    const noResults = document.getElementById("no-results");
    const metaEl = document.getElementById("results-meta");
    const paginationEl = document.getElementById("pagination");

    // 現在の検索結果とページを保存
    currentResults = results;
    currentQuery = query;
    currentPage = page;

    // ホーム非表示 → 結果表示
    homeView.classList.add("hidden");
    resultsView.classList.remove("hidden");

    resultsList.innerHTML = "";
    paginationEl.innerHTML = "";
    noResults.classList.add("hidden");

    if (results.length === 0) {
        noResults.classList.remove("hidden");
        metaEl.textContent = `"${query}" の検索結果：0 件`;
        return;
    }

    metaEl.textContent = `"${query}" の検索結果：約 ${results.length} 件`;

    // ページネーション計算
    const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE);
    const startIndex = (page - 1) * RESULTS_PER_PAGE;
    const endIndex = startIndex + RESULTS_PER_PAGE;
    const pageResults = results.slice(startIndex, endIndex);

    // 現在ページの結果を表示
    pageResults.forEach((item, i) => {
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

    // ページネーションボタンを表示
    if (totalPages > 1) {
        renderPagination(totalPages, page);
    }
}

// ── ページネーション表示 ──
function renderPagination(totalPages, currentPageNum) {
    const paginationEl = document.getElementById("pagination");
    paginationEl.innerHTML = "";

    function makePageBtn(num) {
        const btn = document.createElement("button");
        btn.textContent = num;
        if (num === currentPageNum) btn.classList.add("active");
        btn.addEventListener("click", () => {
            renderResults(currentResults, currentQuery, num);
            window.scrollTo(0, 0);
        });
        return btn;
    }

    function makeEllipsis() {
        const span = document.createElement("span");
        span.textContent = "...";
        span.className = "pagination-ellipsis";
        return span;
    }

    // 前ページボタン
    const prevBtn = document.createElement("button");
    prevBtn.textContent = "前へ";
    prevBtn.disabled = currentPageNum === 1;
    prevBtn.addEventListener("click", () => {
        if (currentPageNum > 1) {
            renderResults(currentResults, currentQuery, currentPageNum - 1);
            window.scrollTo(0, 0);
        }
    });
    paginationEl.appendChild(prevBtn);

    // ページ番号（10以下は全表示、11以上は省略）
    if (totalPages <= 10) {
        for (let i = 1; i <= totalPages; i++) {
            paginationEl.appendChild(makePageBtn(i));
        }
    } else {
        const delta = 2; // 現在ページの前後に表示する数
        const pages = new Set();
        pages.add(1);
        pages.add(totalPages);
        for (let i = currentPageNum - delta; i <= currentPageNum + delta; i++) {
            if (i >= 1 && i <= totalPages) pages.add(i);
        }
        const sorted = [...pages].sort((a, b) => a - b);
        let prev = 0;
        for (const p of sorted) {
            if (p - prev > 1) paginationEl.appendChild(makeEllipsis());
            paginationEl.appendChild(makePageBtn(p));
            prev = p;
        }
    }

    // 次ページボタン
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "次へ";
    nextBtn.disabled = currentPageNum === totalPages;
    nextBtn.addEventListener("click", () => {
        if (currentPageNum < totalPages) {
            renderResults(currentResults, currentQuery, currentPageNum + 1);
            window.scrollTo(0, 0);
        }
    });
    paginationEl.appendChild(nextBtn);
}

// ── 検索を実行 ──
function doSearch(query) {
    if (!query.trim()) return;
    const results = search(query);
    renderResults(results, query);
    // 結果ページの検索バーにも反映
    document.getElementById("results-input").value = query;
    // URLにクエリを反映（ブラウザの戻るボタンで戻れるように）
    history.pushState({ query }, "", `?q=${encodeURIComponent(query)}`);
}

// ── ホームに戻る ──
function goHome() {
    document.getElementById("home-view").classList.remove("hidden");
    document.getElementById("results-view").classList.add("hidden");
    document.getElementById("main-input").value = "";
    history.pushState({ view: "home" }, "", "./");
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

    // 結果ページの検索ボタン
    document.getElementById("results-btn").addEventListener("click", () => {
        doSearch(document.getElementById("results-input").value);
    });

    // 結果ページのEnterキー
    document.getElementById("results-input").addEventListener("keydown", e => {
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

// ── ブラウザバック対応 ──
window.addEventListener("popstate", (e) => {
    if (e.state && e.state.view === "home") {
        goHome();
    } else if (!document.getElementById("home-view").classList.contains("hidden")) {
        // すでにホーム表示の場合は何もしない
        return;
    } else {
        // 検索結果表示中にバックボタンでホームに戻る
        goHome();
    }
});