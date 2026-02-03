// ====================
// AO3 作品信息获取函数
// ====================

// 获取作品 ID
function getWorkId() {
    const match = location.pathname.match(/\/works\/(\d+)/);
    return match ? match[1] : null;
}

// 获取作者名（第一个作者）
function getAuthor() {
    const el = document.querySelector("a[rel='author']");
    return el ? el.innerText.trim() : "Unknown Author";
}

// 获取第一个 Fandom
function getFandom() {
    const el = document.querySelector("dd.fandom.tags a");
    return el ? el.innerText.trim() : "Unknown Fandom";
}

// 获取作品标题
function getWorkTitle() {
    const el = document.querySelector("h2.title");
    return el ? el.innerText.trim() : "Unknown Title";
}


// ====================
// 储存数据
// ====================
function loadData() {
    return JSON.parse(localStorage.getItem("ao3-data") || '{"works":{}}');
}
function saveData(data) {
    localStorage.setItem("ao3-data", JSON.stringify(data));
}


// ====================
// 高亮
// ====================

// 显示高亮:对于每一条笔记,高亮匹配到的第一条
// function highlightRangeByText(node, text, noteId) {
//     const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
//     while (walker.nextNode()) {
//         const currentNode = walker.currentNode;
//         const idx = currentNode.nodeValue.indexOf(text);
//         if (idx !== -1) {
//             const range = document.createRange();
//             range.setStart(currentNode, idx);
//             range.setEnd(currentNode, idx + text.length);

//             const span = document.createElement("span");
//             span.className = "ao3-highlight";
//             span.setAttribute("data-note-id", noteId);

//             range.surroundContents(span);
//             range.detach();
//             return true;
//         }
//     }
//     return false;
// }


// 页面加载时恢复高亮
// function restoreHighlights() {
//     const data = loadData();
//     const workId = getWorkId();
//     if (!workId || !data.works[workId]) return;

//     const notes = data.works[workId].notes;

//     // 遍历页面正文所有段落
//     const paragraphs = document.querySelectorAll("div#workskin p, div#chapters p"); // AO3 正文常用选择器
//     for (const n of notes) {
//         let highlighted = false;
//         for (const p of paragraphs) {
//             highlighted = highlightRangeByText(p, n.text, n.id);
//             if (highlighted) break; // 找到就停止
//         }
//     }
// }


// V2
// function highlightRangeByText(node, text, noteId) {
//     const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
//     while (walker.nextNode()) {
//         const currentNode = walker.currentNode;

//         // 跳过已经在高亮里的文本
//         if (currentNode.parentNode.classList && currentNode.parentNode.classList.contains('ao3-highlight')) {
//             continue;
//         }

//         const idx = currentNode.nodeValue.indexOf(text);
//         if (idx !== -1) {
//             const range = document.createRange();
//             range.setStart(currentNode, idx);
//             range.setEnd(currentNode, idx + text.length);

//             const span = document.createElement("span");
//             span.className = "ao3-highlight";
//             span.setAttribute("data-note-id", noteId);

//             range.surroundContents(span);
//             range.detach();
//             return true;
//         }
//     }
//     return false;
// }

// function restoreHighlights() {
//     const data = loadData();
//     const workId = getWorkId();
//     if (!workId || !data.works[workId]) return;

//     const notes = data.works[workId].notes;
//     const paragraphs = document.querySelectorAll("div#workskin p, div#chapters p");

//     for (const n of notes) {
//         let found = false;
//         for (const p of paragraphs) {
//             found = highlightRangeByText(p, n.text, n.id);
//             if (found) break; // 找到对应段落就停止搜索段落
//         }
//         if (!found) {
//             console.warn("未找到笔记文本:", n.text);
//         }
//     }
// }


// V3
// 高亮段落中所有匹配的文本节点
function highlightRangeByTextAll(node, text, noteId) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    let matched = false;

    while (walker.nextNode()) {
        const currentNode = walker.currentNode;

        // 跳过已经高亮的文本
        if (currentNode.parentNode.classList && currentNode.parentNode.classList.contains('ao3-highlight')) {
            continue;
        }

        let idx = currentNode.nodeValue.indexOf(text);
        while (idx !== -1) {
            const range = document.createRange();
            range.setStart(currentNode, idx);
            range.setEnd(currentNode, idx + text.length);

            const span = document.createElement("span");
            span.className = "ao3-highlight";
            span.dataset.noteId = noteId;

            range.surroundContents(span);
            range.detach();
            matched = true;

            // 在同一文本节点中继续查找剩余匹配
            idx = currentNode.nodeValue.indexOf(text, idx + text.length);
        }
    }

    return matched;
}
function restoreHighlights() {
    const data = loadData();
    const workId = getWorkId();
    if (!workId || !data.works[workId]) return;

    const notes = data.works[workId].notes;

    // AO3 正文段落选择器
    const paragraphs = document.querySelectorAll("div#workskin p, div#chapters p");

    for (const n of notes) {
        for (const p of paragraphs) {
            highlightRangeByTextAll(p, n.text, n.id);
        }
    }
}



// ====================
// 显示当前作品的笔记
// (这是最符合阅读体验的）
// ====================
function renderNotes() {
    const list = document.getElementById("note-list");
    list.innerHTML = "";

    const data = loadData();
    const workId = getWorkId();
    if (!data.works[workId]) return;

    for (const n of data.works[workId].notes) {
        const div = document.createElement("div");
        div.className = "ao3-note-item";
        div.innerHTML = `
      <div><strong>原文：</strong>${n.text}</div>
      <div><strong>笔记：</strong>${n.note}</div>
    `;
        list.appendChild(div);
    }
}




// 创建侧边栏（笔记汇总区）
const panel = document.createElement("div");
panel.id = "ao3-note-panel";
panel.innerHTML = "<h3>📒 My note</h3><div id='note-list'></div>";
document.body.appendChild(panel);


// *** 监听划线保存笔记（mouseup 事件）
// 这一段实现：选中文字，高亮，写评论，存本地

document.addEventListener("mouseup", () => {
    // 选中文字后显示弹窗
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) return;

    const note = prompt("留下一条笔记吧：");
    if (!note) return;


    // 高亮（安全版本）
    const span = document.createElement("span");
    span.className = "ao3-highlight";
    span.textContent = text;

    range.deleteContents();
    range.insertNode(span);
    selection.removeAllRanges();

    // 储存笔记数据
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
        id: crypto.randomUUID(),
        text,
        note,
        time: Date.now()
    });

    saveData(data);
    renderNotes();



});


// 笔记汇总渲染（侧边栏）
renderNotes();


// 页面加载后初始化侧边栏笔记
// window.addEventListener("DOMContentLoaded", () => {
//     renderNotes();         // 渲染侧边栏笔记
//     restoreHighlights();   // 页面刷新后恢复高亮
// });
window.addEventListener("load", () => {
    setTimeout(() => {
        renderNotes();
        restoreHighlights();
    }, 500); // 等半秒让 AO3 内容加载完成
});
