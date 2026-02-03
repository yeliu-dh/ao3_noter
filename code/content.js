// ====================
// 获取作品信息
// ====================
function getWorkId() {
    const match = location.pathname.match(/\/works\/(\d+)/);
    return match ? match[1] : null;
}

function getAuthor() {
    const el = document.querySelector("a[rel='author']");
    return el ? el.innerText.trim() : "Unknown Author";
}

function getFandom() {
    const el = document.querySelector("dd.fandom.tags a");
    return el ? el.innerText.trim() : "Unknown Fandom";
}

function getWorkTitle() {
    const el = document.querySelector("h2.title, h3.title");
    return el ? el.innerText.trim() : "Unknown Title";
}

// ====================
// 数据存储
// ====================
function loadData() {
    return JSON.parse(localStorage.getItem("ao3-data") || '{"works":{}}');
}

function saveData(data) {
    localStorage.setItem("ao3-data", JSON.stringify(data));
}

// ====================
// 获取当前章节 ID
// ====================
function getCurrentChapterID() {
    const chaptersDiv = document.getElementById("chapters");
    if (!chaptersDiv) return null;
    const chapterDivs = chaptersDiv.querySelectorAll("div.chapter");
    for (const div of chapterDivs) {
        const rect = div.getBoundingClientRect();
        if (rect.top >= 0) return div.id;
    }
    return chapterDivs.length ? chapterDivs[chapterDivs.length - 1].id : null;
}

// ====================
// 高亮文字（简单版本）
// ====================
function highlightText(text, noteId) {
    if (!text) return;

    const paragraphs = document.querySelectorAll("div#workskin p, div#chapters p");

    paragraphs.forEach(p => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (!node.nodeValue) continue;
            if (node.parentNode.classList && node.parentNode.classList.contains('ao3-highlight')) continue;

            const idx = node.nodeValue.indexOf(text);
            if (idx !== -1) {
                const range = document.createRange();
                range.setStart(node, idx);
                range.setEnd(node, idx + text.length);

                const span = document.createElement("span");
                span.className = "ao3-highlight";
                span.dataset.noteId = noteId;
                span.style.backgroundColor = "yellow";

                range.surroundContents(span);
                range.detach();
            }
        }
    });
}

function highlightSelection(noteId) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    const span = document.createElement("span");
    span.className = "ao3-highlight";
    span.dataset.noteId = noteId;
    span.style.background = "yellow";

    try {
        range.surroundContents(span);
    } catch {
        // fallback：拆开包裹（复杂情况）
        const fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);
    }

    selection.removeAllRanges();
}

// ====================
// 侧边栏
// ====================
function createSidebar() {
    if (document.getElementById("ao3-note-panel")) return;
    const panel = document.createElement("div");
    panel.id = "ao3-note-panel";
    panel.style = "position:fixed;right:0;top:50px;width:300px;max-height:80%;overflow-y:auto;background:#fdf6e3;border-left:2px solid #ccc;padding:10px;z-index:9999;";
    panel.innerHTML = "<h3>📒 My Notes</h3><div id='note-list'></div>";
    document.body.appendChild(panel);
}

// ====================
// 渲染侧边栏
// ====================
function renderNotes() {
    const list = document.getElementById("note-list");
    if (!list) return;
    list.innerHTML = "";

    const data = loadData();
    const workId = getWorkId();
    if (!workId || !data.works[workId]) return;

    data.works[workId].notes.forEach(n => {
        const div = document.createElement("div");
        div.className = "ao3-note-item";
        div.innerHTML = `
            <div><strong>原文：</strong>${n.text}</div>
            <div><strong>笔记：</strong>${n.note}</div>
            <div><em>章节：</em>${n.chapterID}</div>
        `;
        list.appendChild(div);
    });
}

// ====================
// 添加笔记
// ====================
function addNote(text, note) {
    const workId = getWorkId();
    if (!workId) return;

    const data = loadData();
    if (!data.works[workId]) {
        data.works[workId] = {
            workId,
            author: getAuthor(),
            title: getWorkTitle(),
            fandom: getFandom(),
            notes: []
        };
    }

    const noteData = {
        id: crypto.randomUUID(),
        // chapterID: getCurrentChapterID(),
        text,
        note,
        time: Date.now()
    };

    data.works[workId].notes.push(noteData);
    saveData(data);

    highlightText(text, noteData.id);
    renderNotes();
}

// ====================
// 选中文字添加笔记
// ====================
// document.addEventListener("mouseup", () => {
//     const selection = window.getSelection();
//     if (!selection || selection.isCollapsed) return;
//     const text = selection.toString().trim();
//     if (!text) return;

//     const note = prompt("留下一条笔记吧：");
//     if (!note) return;

//     selection.removeAllRanges();
//     addNote(text, note);
// });

document.addEventListener("mouseup", () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text) return;

    const note = prompt("留下一条笔记吧：");
    if (!note) return;

    const noteId = crypto.randomUUID();

    // ⭐ 关键：先高亮选区（跨段）
    highlightSelection(noteId);

    // 再存数据
    const data = loadData();
    const workId = getWorkId();
    if (!workId) return;

    if (!data.works[workId]) {
        data.works[workId] = {
            workId,
            author: getAuthor(),
            title: getWorkTitle(),
            fandom: getFandom(),
            notes: []
        };
    }

    data.works[workId].notes.push({
        id: noteId,
        chapterID: getCurrentChapterID(),
        text,
        note,
        time: Date.now()
    });

    saveData(data);
    renderNotes();
});


// ====================
// 恢复高亮
// ====================
// function restoreHighlights() {
//     const data = loadData();
//     const workId = getWorkId();
//     if (!workId || !data.works[workId]) return;

//     data.works[workId].notes.forEach(n => highlightText(n.text, n.id));
// }
function restoreHighlights() {
    const data = loadData();
    const workId = getWorkId();
    if (!workId || !data.works[workId]) return;

    data.works[workId].notes.forEach(n => {
        // 只尝试在单个文本节点内恢复
        highlightText(n.text, n.id);
    });
}

// ====================
// 页面初始化
// ====================
window.addEventListener("load", () => {
    createSidebar();
    setTimeout(() => {
        restoreHighlights();
        renderNotes();
    }, 500); // 简单等待 AO3 内容加载
});
