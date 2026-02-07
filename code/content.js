// ====================== AO3 NOTER v1 =======================

//-------------初始化数据库---------------
if (!localStorage.getItem("ao3notes")) {
    localStorage.setItem("ao3notes", JSON.stringify([]))
    console.log("Initialized ao3notes")
}

// ======================工具函数 ========================
// ====================
// HELPERS
// ====================
function getWorkId() {
    const match = location.pathname.match(/\/works\/(\d+)/);
    return match ? match[1] : null;
}
function getAuthor() {
    const el = document.querySelector("a[rel='author']");
    return el ? el.innerText.trim() : "Unknown Author";
}
function getWorkTitle() {
    const el = document.querySelector("h2.title");
    return el ? el.innerText.trim() : "Unknown Title";
}
function getFandom() {
    const el = document.querySelector("dd.fandom.tags a");
    return el ? el.innerText.trim() : "Unknown Fandom";
}

function getCurrentChapterID() {
    const select = document.querySelector("li.chapter select[name='selected_id']");
    if (!select) return null;
    const option = select.querySelector("option[selected='selected']");
    return option ? option.value : null;
}

//main 
function getWorkMeta() {
    const workId = getWorkId();    // 你现有函数
    const author = getAuthor();
    const title = getWorkTitle();
    const fandom = getFandom();
    const chapterId = getCurrentChapterID();

    return {
        workId: workId,
        author: author,
        title: title,
        fandom: fandom,
        chapterId: chapterId
    };
}



// function getWorkMeta() {
//     // ------ Work ID ------
//     const workMatch = location.pathname.match(/\/works\/(\d+)/)
//     const workId = workMatch ? workMatch[1] : null

//     // ------ Author ------
//     const authorEl = document.querySelector("a[rel='author']")
//     const author = authorEl
//         ? authorEl.innerText.trim()
//         : "Unknown Author"

//     // ------ Title ------
//     const titleEl = document.querySelector("h2.title")
//     const title = titleEl
//         ? titleEl.innerText.trim()
//         : "Unknown Title"

//     // ------ Fandom ------
//     const fandomEl = document.querySelector("dd.fandom.tags a")
//     const fandom = fandomEl
//         ? fandomEl.innerText.trim()
//         : "Unknown Fandom"

//     // ------ Chapter ID ------
//     const select = document.querySelector("li.chapter select[name='selected_id']")
//     let chapterId = null

//     if (select) {
//         const option = select.querySelector("option[selected='selected']")
//         if (option) {
//             chapterId = option.value
//         }
//     }
//     // 返回一个对象（类似 Python dict）
//     // return {
//     //     workId,
//     //     author,
//     //     title,
//     //     fandom,
//     //     chapterId
//     // }
//     return {
//         workId: workId,
//         author: author,
//         title: title,
//         fandom: fandom,
//         chapterId: chapterId
//     };

// }


// ---------- 获取选区所在段落 ----------


function getEndParagraphIndexFromRange(range) {
    if (!range) return null;

    let node = range.endContainer;

    // 往上找 <p>
    while (node && node.nodeName !== "P") {
        node = node.parentNode;
    }

    if (!node) return null;

    const paragraphs = document.querySelectorAll("#workskin p");
    const arr = Array.from(paragraphs);
    return arr.indexOf(node);
}



// ---------- 数据存储 ----------
// 初始化 localStorage，如果之前被删除了
// function initNotesStorage() {
//     if (!localStorage.getItem("ao3notes")) {
//         localStorage.setItem("ao3notes", JSON.stringify([]));
//         console.log("Initialized ao3notes");
//     }
// }

// // 读取笔记
// function loadNotes() {
//     initNotesStorage();
//     const raw = localStorage.getItem("ao3notes");
//     try {
//         const notes = JSON.parse(raw || "[]");
//         console.log("Loaded notes:", notes);
//         return notes;
//     } catch (e) {
//         console.error("Error parsing ao3notes, resetting storage:", e);
//         localStorage.setItem("ao3notes", JSON.stringify([]));
//         return [];
//     }
// }

// // 保存笔记
// function saveNotes(notes) {
//     console.log("Saving notes:", notes);
//     localStorage.setItem("ao3notes", JSON.stringify(notes));
// }




// ===========================DB储存=============================

const DB_NAME = "ao3notesDB";
const DB_VERSION = 1;
const STORE_NAME = "notes";

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "noteId" });
                store.createIndex("workId", "workId", { unique: false });
                store.createIndex("chapterId", "chapterId", { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// 当前我们存储的数据是 扁平化的单条 note 记录：noteId为唯一key
// 优势：可以直接按索引查询任意 work/chapter 的所有 note，增量写入/更新/删除，不会每次 serialize 整个数据库

async function createNoteWithEmojiIndexed(noteData) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // noteData 必须包含：noteId, workId, chapterId, text, marker, endParagraphIndex, note
    store.put(noteData);

    return tx.complete || new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}

async function loadNotesByWork(workId) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("workId");

    return new Promise((resolve, reject) => {
        const request = index.getAll(workId); // 查询所有 workId 为当前的 note
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
} //返回的结果是 数组 [noteData, noteData, ...],用renderMarker(note, note.workId, note.chapterId) 渲染页面



// updateNote() 和 deleteNote() 都是 异步函数（async），内部操作 IndexedDB，需要时间完成写入
// await 的作用： 等待 IndexedDB 完成写入/删除操作后再继续执行后面的代码，保证数据库状态和页面 DOM 状态一致

async function updateNote(noteData) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(noteData);
    return tx.complete || new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}

async function deleteNote(noteId) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(noteId);
    return tx.complete || new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}




// ========================== UI函数 ============================
// ---------- Marker 渲染 ----------
function renderMarker(noteData, workId, chapterId) {
    const paragraphs = document.querySelectorAll("#workskin p");
    const idx = noteData.endParagraphIndex;
    if (idx === null || idx >= paragraphs.length) return;

    const p = paragraphs[idx];

    // 1️⃣ 创建 marker span
    const marker = document.createElement("span");
    marker.textContent = " " + (noteData.marker || "❤️");
    marker.style.cursor = "pointer";
    marker.style.userSelect = "none";

    // 2️⃣ 创建笔记显示 span（小字体斜体），默认隐藏
    const noteSpan = document.createElement("span");
    noteSpan.textContent = noteData.note ? " " + noteData.note : "";
    noteSpan.style.fontStyle = "italic";
    noteSpan.style.fontSize = "0.85em";
    noteSpan.style.color = "teal";
    noteSpan.style.marginLeft = "4px";
    noteSpan.style.display = "none"; // 默认隐藏

    p.appendChild(marker);
    p.appendChild(noteSpan);

    // 3️⃣ 点击 marker 弹出菜单
    marker.onclick = () => {
        // 移除已有菜单
        const existingMenu = document.getElementById("marker-menu");
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement("div");
        menu.id = "marker-menu";
        menu.style.position = "absolute";
        menu.style.background = "white";
        menu.style.border = "1px solid #ccc";
        menu.style.padding = "4px";
        menu.style.display = "flex";
        menu.style.gap = "4px";
        menu.style.zIndex = 9999;

        // 定位菜单
        const rect = marker.getBoundingClientRect();
        menu.style.top = (rect.bottom + window.scrollY + 2) + "px";
        menu.style.left = (rect.left + window.scrollX) + "px";

        // ===== 文本框 =====
        const input = document.createElement("input");
        input.type = "text";
        input.value = noteData.note || "";
        input.style.flex = "1";
        menu.appendChild(input);

        // ===== Save 按钮 =====
        const saveBtn = document.createElement("button");
        saveBtn.textContent = "Save";
        saveBtn.onclick = async () => {
            noteData.note = input.value;
            noteSpan.textContent = input.value ? " " + input.value : "";
            if (input.value) noteSpan.style.display = "inline";

            // ✅ IndexedDB 更新
            await updateNote(noteData);

            menu.remove();
        };
        menu.appendChild(saveBtn);

        // ===== Delete 按钮 =====
        const delBtn = document.createElement("button");
        delBtn.textContent = "Delete";
        delBtn.onclick = async () => {
            marker.remove();
            noteSpan.remove();

            // ✅ IndexedDB 删除
            await deleteNote(noteData.noteId);

            menu.remove();
        };
        menu.appendChild(delBtn);

        // ===== Show 按钮 =====
        let showNote = false; // 默认不显示
        const showBtn = document.createElement("button");
        showBtn.textContent = "Show";
        showBtn.onclick = () => {
            showNote = !showNote;
            noteSpan.style.display = showNote && noteData.note ? "inline" : "none";
        };
        menu.appendChild(showBtn);

        document.body.appendChild(menu);

        // 点击其他地方关闭菜单
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target !== marker) {
                menu.remove();
                document.removeEventListener("mousedown", closeMenu);
            }
        };
        document.addEventListener("mousedown", closeMenu);
    };
}


async function renderNotesForChapter(workId, chapterId) {
    const notes = await loadNotesByWork(workId);
    notes
        .filter(n => n.chapterId === chapterId)  // 只渲染当前章
        .forEach(note => renderMarker(note, note.workId, note.chapterId));
}


//-------------EMOJIS ROW------------
// LOCAL version
const EMOJI_KEY = "ao3-emojis";

function getEmojis() {
    let stored = localStorage.getItem(EMOJI_KEY);

    if (!stored) {
        const initial = ["❤️", "🔥", "✨", "😭", "💔"];
        localStorage.setItem(EMOJI_KEY, JSON.stringify(initial));
        return initial;
    }

    try {
        return JSON.parse(stored);
    } catch {
        return [];
    }
}

function saveEmojis(arr) {
    localStorage.setItem(EMOJI_KEY, JSON.stringify(arr));
}





function renderEmojiList(container) {
    container.innerHTML = "";
    const emojis = getEmojis();

    emojis.forEach(e => {
        const item = document.createElement("span");
        item.textContent = e;
        item.dataset.val = e;

        Object.assign(item.style, {
            padding: "3px 5px",
            borderRadius: "6px",
            cursor: "pointer",
            userSelect: "none",
            fontSize: "18px"
        });

        // ⭐ 点击选择
        item.onclick = () => {

            item.classList.toggle("selected");

            if (item.classList.contains("selected")) {
                item.style.background = "#007aff33";
            } else {
                item.style.background = "";
            }
        };

        container.appendChild(item);
    });
}


function showEmojiManager(anchor) {

    // 如果已有面板 → 关闭
    const old = document.querySelector(".ao3-emoji-panel");
    if (old) old.remove();

    const panel = document.createElement("div");
    panel.className = "ao3-emoji-panel";

    // ⭐⭐⭐⭐⭐ 核心样式（移动端优化）
    Object.assign(panel.style, {
        position: "absolute",
        background: "white",
        border: "1px solid #ddd",
        borderRadius: "10px",
        padding: "10px",
        zIndex: 999999,

        maxWidth: "92vw",        // ✅ 不超过屏幕
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        fontSize: "16px"
    });


    //🟢 添加行（简洁右对齐）
    const addRow = document.createElement("div");

    addRow.style.display = "flex";
    addRow.style.gap = "6px";
    addRow.style.marginBottom = "8px";

    const input = document.createElement("input");
    input.placeholder = "emoji / text";
    input.style.flex = "1";
    input.style.border = "1px solid #ccc";
    input.style.borderRadius = "6px";
    input.style.padding = "4px";

    const addBtn = document.createElement("span");
    addBtn.textContent = "add";
    // ⭐ 无边框按钮风格
    Object.assign(addBtn.style, {
        cursor: "pointer",
        color: "#880000",//"#007aff",
        fontSize: "14px",
        opacity: "0.85",
        padding: "4px 6px"
    });


    // addBtn.style.cursor = "pointer";
    // addBtn.style.padding = "4px 6px";
    // addBtn.style.color = "#007aff";   // iOS 蓝

    addBtn.onclick = () => {
        const val = input.value.trim();
        if (!val) return;

        const emojis = getEmojis();
        emojis.push(val);
        saveEmojis(emojis);

        refreshEmojiRow();//重新渲染emojirow
        renderEmojiList(listContainer);

        input.value = "";
    };

    addRow.appendChild(input);
    addRow.appendChild(addBtn);
    panel.appendChild(addRow);


    //🟡 Emoji 横排多选区
    const listContainer = document.createElement("div");
    Object.assign(listContainer.style, {
        display: "flex",
        flexWrap: "wrap",     // ⭐ 自动换行
        gap: "6px",
        marginBottom: "8px"
    });

    panel.appendChild(listContainer);

    renderEmojiList(listContainer)

    //🔵 Delete按钮（右对齐）
    const delRow = document.createElement("div");
    delRow.style.textAlign = "right";

    const delBtn = document.createElement("span");
    delBtn.textContent = "delete";
    Object.assign(delBtn.style, {
        cursor: "pointer",
        color: "#880000",//"#ff3b30",
        fontSize: "14px",
        opacity: "0.85",
        padding: "4px 6px"
    });

    // delBtn.style.cursor = "pointer";
    // delBtn.style.color = "#ff3b30"; // iOS红

    delBtn.onclick = () => {

        const selected = Array.from(
            listContainer.querySelectorAll(".selected")
        ).map(el => el.dataset.val);

        let emojis = getEmojis();
        emojis = emojis.filter(e => !selected.includes(e));

        saveEmojis(emojis);
        refreshEmojiRow();
        renderEmojiList(listContainer);
    };

    delRow.appendChild(delBtn);
    panel.appendChild(delRow);

    //📍插入并定位 
    document.body.appendChild(panel);

    const rect = anchor.getBoundingClientRect();

    panel.style.top =
        rect.bottom + window.scrollY + 4 + "px";

    panel.style.left =
        Math.min(
            rect.left + window.scrollX,
            window.innerWidth - panel.offsetWidth - 10
        ) + "px";


    //点击空白关闭面板
    setTimeout(() => {
        document.addEventListener("mousedown", closePanel);
    }, 0);

    function closePanel(e) {
        if (!panel.contains(e.target) && e.target !== anchor) {
            panel.remove();
            document.removeEventListener("mousedown", closePanel);
        }
    }


}


function renderEmojiRow(container) {
    container.innerHTML = "";

    const emojis = getEmojis();

    emojis.forEach(e => {
        const span = document.createElement("span");
        span.textContent = e;
        span.className = "ao3-emoji";

        span.onclick = () => {
            createNoteWithEmoji(e);
        };

        container.appendChild(span);
    });

    // emoji manager button
    const manageBtn = document.createElement("span");
    manageBtn.textContent = " […] ";
    manageBtn.onclick = () => showEmojiManager(manageBtn);
    container.appendChild(manageBtn);

}


// 找当前页面上的 emoji row，清空row，重新按 storage 渲染
function refreshEmojiRow() {
    const row = document.querySelector(".ao3-emoji-row");
    if (row) renderEmojiRow(row);
}



// ============================ 逻辑函数 =============================
// ======== 创建笔记函数 ========
async function createNoteWithEmoji(markerEmoji) {
    if (!currentSelectedText || currentEndParagraphIndex === null) return;

    const meta = getWorkMeta();
    const workId = meta.workId;
    const chapterId = meta.chapterId;

    const noteData = {
        noteId: Date.now().toString(),
        workId,
        chapterId,
        text: currentSelectedText,
        note: "",
        marker: markerEmoji || "📝",
        endParagraphIndex: currentEndParagraphIndex,
        time: Date.now()
    };

    // ✅ IndexedDB 保存
    await createNoteWithEmojiIndexed(noteData);

    // 渲染 marker
    renderMarker(noteData, workId, chapterId);

    // 清理缓存
    currentSelectedText = "";
    currentEndParagraphIndex = null;
    if (emojiUI) removeEmojiUI();

    console.log("New note created:", noteData);
}



// ---------- 初始化 ----------
// ========================== 事件监听 (放最后) =======================

let emojiUI = null;
let currentSelectedText = ""; // 全局变量，保存当前选中文字
let currentEndParagraphIndex = null;

// ======== 选区监听 ========
document.addEventListener("selectionchange", () => {
    //这一段sel不会消失

    // text
    const sel = window.getSelection();
    const text = sel.toString().trim();
    if (text.length < 1) return;
    currentSelectedText = text;
    // console.log("Show currentSelectedText:", currentSelectedText);

    //lastpidx
    currentEndParagraphIndex = getEndParagraphIndexFromRange(sel.getRangeAt(0));


    // 显示 emoji row
    showEmojiRowAtSelection(sel);
});



// ======== Emoji Row 显示函数 ========
function showEmojiRowAtSelection(sel) {

    if (emojiUI) emojiUI.remove();

    const rect = sel.getRangeAt(0).getBoundingClientRect();

    // 创建容器
    const row = document.createElement("div");
    row.className = "ao3-emoji-row";

    // 渲染 emojis
    renderEmojiRow(row);

    // 定位
    row.style.position = "absolute";
    row.style.top = (rect.bottom + window.scrollY + 2) + "px";
    row.style.left = (rect.left + window.scrollX) + "px";
    row.style.background = "white";
    row.style.padding = "4px";
    row.style.border = "1px solid #ccc";
    row.style.borderRadius = "6px";
    row.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    row.style.zIndex = 9999;

    document.body.appendChild(row);
    emojiUI = row;

    // 点击空白关闭
    setTimeout(() => {
        document.addEventListener("mousedown", closeRowOnClickOutside);
    }, 0);

    function closeRowOnClickOutside(e) {
        // 如果点击不在 row 内
        if (!row.contains(e.target)) {
            row.remove();
            emojiUI = null;
            document.removeEventListener("mousedown", closeRowOnClickOutside);
        }
    }
}

// // ======== Emoji Row 显示函数 ========
// function showEmojiRowAtSelection(sel) {
//     // console.log("Show currentSelectedText:", currentSelectedText);

//     // 防止重复
//     if (emojiUI) emojiUI.remove();

//     const rect = sel.getRangeAt(0).getBoundingClientRect();

//     const { row } = createEmojiRow("❤️", (emoji) => {
//         createNoteWithEmoji(emoji);
//         removeEmojiUI();
//     });

//     // 浮动定位
//     row.style.position = "absolute";
//     row.style.top = (rect.bottom + window.scrollY + 2) + "px";
//     row.style.left = (rect.left + window.scrollX) + "px";
//     row.style.background = "white";
//     row.style.padding = "4px";
//     row.style.border = "1px solid #ccc";
//     row.style.zIndex = 9999;

//     document.body.appendChild(row);
//     emojiUI = row;
// }

function removeEmojiUI() {
    if (emojiUI) {
        emojiUI.remove();
        emojiUI = null;
    }
}


// // 当选区变化触发+emoji选择确认
// document.addEventListener("selectionchange", () => {

//     const sel = window.getSelection()
//     const text = sel.toString().trim()
//     if (text.length < 1) return;

//     // 保存当前选中文字
//     currentSelectedText = text;

//     // 防止重复UI
//     if (emojiUI) return

//     const range = sel.getRangeAt(0)
//     const rect = range.getBoundingClientRect()

//     const { row } = createEmojiRow("❤️", (emoji) => {

//         createNoteWithEmoji(emoji)

//         removeEmojiUI()
//         sel.removeAllRanges()
//     })

//     // ⭐ 浮动定位
//     row.style.position = "fixed"
//     row.style.top = (rect.top - 40) + "px"
//     row.style.left = rect.left + "px"
//     row.style.background = "white"
//     row.style.padding = "4px"
//     row.style.border = "1px solid #ccc"
//     row.style.zIndex = 9999

//     document.body.appendChild(row)
//     emojiUI = row
// })

// //点击空白或者移动emoji row消失
// document.addEventListener("mousedown", (e) => {

//     if (!emojiUI) return

//     if (!emojiUI.contains(e.target)) {
//         removeEmojiUI()
//     }
// })

// function removeEmojiUI() {
//     if (emojiUI) {
//         emojiUI.remove()
//         emojiUI = null
//     }
// }


// 页面加载时重新渲染marker

window.addEventListener("load", async () => {
    const workId = getWorkId();
    const chapterId = getCurrentChapterID(); // 当前章节
    await renderNotesForChapter(workId, chapterId);
});
