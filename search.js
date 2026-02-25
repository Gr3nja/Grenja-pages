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


// =============================================
// ── エラーページへリダイレクト ──
// =============================================

/**
 * error.html へ遷移する
 * @param {string} code  例: "CORSError"
 * @param {string} desc  例: "異なるオリジンからのアクセスが拒否されました"
 */
function redirectToError(code, desc) {
    const params = new URLSearchParams({ code, desc });
    location.href = `error.html?${params.toString()}`;
}


// ── fetch エラーを CORS / 接続失敗 に振り分ける ──
function handleFetchError(e) {
    const msg = (e?.message || "").toLowerCase();

    // CORSエラー：オンラインなのに fetch が失敗した場合
    if (
        msg.includes("cors") ||
        msg.includes("cross-origin") ||
        msg.includes("blocked") ||
        (msg.includes("failed to fetch") && navigator.onLine)
    ) {
        redirectToError(
            "CORSError",
            "異なるオリジンからのアクセスが拒否されました。\nとりあえず面倒くさいので待機してください"
        );
        return;
    }

    // 接続失敗：オフライン・DNS解決失敗など
    redirectToError(
        "ConnectionError",
        "サーバーへの接続に失敗しました。インターネット接続を確認してください。"
    );
}


// =============================================
// ── CSV パーサ ──
// =============================================
function parseCSV(text) {

    // 文字化け検出：U+FFFD（置換文字）が含まれていたら EncodingError
    if (text.includes("\uFFFD")) {
        redirectToError(
            "EncodingError",
            "とりあえず面倒くさいので待機してください。"
        );
        return [];
    }

    try {
        const rows = [];
        let row = [];
        let field = "";
        let i = 0;
        let inQuotes = false;

        while (i < text.length) {
            const c = text[i];

            if (c === '"') {
                if (inQuotes && text[i + 1] === '"') { field += '"'; i += 2; continue; }
                inQuotes = !inQuotes; i++; continue;
            }
            if (c === ',' && !inQuotes) { row.push(field); field = ""; i++; continue; }
            if ((c === '\r' || c === '\n') && !inQuotes) {
                row.push(field); field = "";
                rows.push(row); row = [];
                if (c === '\r' && text[i + 1] === '\n') i++;
                i++; continue;
            }
            field += c; i++;
        }

        if (field !== "" || inQuotes) row.push(field);
        if (row.length) rows.push(row);

        if (rows.length === 0) {
            redirectToError("ParseError", "CSVファイルがお前の頭レベルで空です。\n開発者に問い合わせてください。");
            return [];
        }

        const headers = rows.shift().map(h => h.trim());

        // 必須カラム確認
        if (!headers.includes("url") || !headers.includes("title")) {
            redirectToError(
                "ParseError",
                `CSVに必須カラム "url" または "title" が見つかりません。(検出カラム: ${headers.join(", ")})`
            );
            return [];
        }

        return rows.map(r => {
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ""; });
            return obj;
        });

    } catch (e) {
        redirectToError("ParseError", `CSVの解析中にエラーが発生しました。(${e.message})`);
        return [];
    }
}


// =============================================
// ── index.csv を別リポジトリから読み込む ──
// =============================================
async function loadIndex() {
    const statusEl = document.getElementById("index-status");
    statusEl.textContent = "読み込み中...";

    // ① fetch 実行
    let res;
    try {
        res = await fetch(INDEX_URL);
    } catch (e) {
        handleFetchError(e);   // → error.html へリダイレクト
        return;
    }

    // ② HTTP ステータス確認
    if (!res.ok) {
        redirectToError(
            "BrainError",
            `あなたの脳細胞がいくつか死んでます。(ステータス: ${res.status}) \nエラーの改善のために待つか、頭の病院に行くことを推奨します。`
        );
        return;
    }

    // ③ テキスト取得
    let text;
    try {
        text = await res.text();
    } catch (e) {
        redirectToError(
            "EncodingError",
            "あなたの目が悪いのでファイルの読み取りに失敗しました。\nContactからGr3njaに言ってください。"
        );
        return;
    }

    // ④ CSV パース（エラー時はパーサ内でリダイレクト）
    searchIndex = parseCSV(text);

    statusEl.textContent = searchIndex.length > 0
        ? `${searchIndex.length} ページ読み込み済み`
        : "データが空です";
}


// =============================================
// ── 検索ロジック ──
// =============================================
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
                if (title.includes(kw)) { score += 3; titleMatchCount++; }
                if (url.includes(kw)) score += 1;
            }

            const titleTier = titleMatchCount === keywords.length ? 2
                : titleMatchCount > 0 ? 1 : 0;

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

    currentResults = results;
    currentQuery = query;
    currentPage = page;

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

    const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE);
    const startIndex = (page - 1) * RESULTS_PER_PAGE;
    const pageResults = results.slice(startIndex, startIndex + RESULTS_PER_PAGE);

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

    if (totalPages > 1) renderPagination(totalPages, page);
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

    if (totalPages <= 10) {
        for (let i = 1; i <= totalPages; i++) paginationEl.appendChild(makePageBtn(i));
    } else {
        const delta = 2;
        const pages = new Set([1, totalPages]);
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
    document.getElementById("results-input").value = query;
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

    document.getElementById("main-btn").addEventListener("click", () => {
        doSearch(document.getElementById("main-input").value);
    });
    document.getElementById("main-input").addEventListener("keydown", e => {
        if (e.key === "Enter") doSearch(e.target.value);
    });

    document.getElementById("results-btn").addEventListener("click", () => {
        doSearch(document.getElementById("results-input").value);
    });
    document.getElementById("results-input").addEventListener("keydown", e => {
        if (e.key === "Enter") doSearch(e.target.value);
    });

    document.querySelector(".header-logo").addEventListener("click", e => {
        e.preventDefault();
        goHome();
    });

    const params = new URLSearchParams(location.search);
    const q = params.get("q");
    if (q) doSearch(q);
});


// ── ブラウザバック対応 ──
window.addEventListener("popstate", (e) => {
    if (e.state && e.state.view === "home") {
        goHome();
    } else if (!document.getElementById("home-view").classList.contains("hidden")) {
        return;
    } else {
        goHome();
    }
});