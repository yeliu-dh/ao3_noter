// ====================== AO3 NOTER v1 =======================

// ======================工具函数 ========================
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

function getCurrentChapter() {
    const select = document.querySelector("li.chapter select[name='selected_id']");
    if (!select) return { id: null, name: "Unknown Chapter" };

    const option = select.querySelector("option[selected='selected']");
    if (!option) return { id: null, name: "Unknown Chapter" };

    return {
        id: option.value,
        name: option.textContent.trim()
    };
}

// Meta main 
function getWorkMeta() {
    const workId = getWorkId();    // 你现有函数
    const author = getAuthor();
    const title = getWorkTitle();
    const fandom = getFandom();
    const chapter = getCurrentChapter();

    return {
        workId: workId,
        author: author,
        fandom: fandom,
        title: title,
        chapterId: chapter.id,
        chapterName: chapter.name
    };
}


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

function getStartParagraphIndexFromRange(range) {
    if (!range) return null;

    let node = range.startContainer;

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







// ====================================DB储存=======================================
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


// ========================
// MOD: 加载 IndexedDB 中的所有笔记
// ========================
async function loadAllNotes() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
        const request = store.getAll(); // 直接获取 store 内的所有笔记
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}



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



// ================================= Marker 渲染 ========================================
// function getContextText(noteData) {
//     const text = noteData.text || "xxx";
//     const len = text.length;

//     const before = text.slice(0, 10); // 前10字符
//     const after = text.slice(len - 10, len); // 后10字符

//     if (len <= 20) {
//         // 太短就直接全部显示
//         return text;
//     } else {
//         return `${before}…${after}`;
//     }
// }


// =======================================
// 1️⃣ 渲染 DOM
// =======================================

function renderMarkerUI(noteData) {
    const paragraphs = document.querySelectorAll("#workskin p");
    const startP = paragraphs[noteData.startParagraphIndex ?? 0];
    const endP = paragraphs[noteData.endParagraphIndex ?? 0];

    if (!startP || !endP) return;

    // // ----- { -----
    // const openBrace = document.createElement("span");
    // openBrace.textContent = "/";//"{";
    // openBrace.dataset.noteId = noteData.noteId;
    // Object.assign(openBrace.style, { fontStyle: "bold", color: "#880000", fontSize: "20px", marginRight: "2px" });
    // startP.prepend(openBrace);

    // // ----- } -----
    // const closeBrace = document.createElement("span");
    // closeBrace.textContent = "/";
    // closeBrace.dataset.noteId = noteData.noteId;
    // Object.assign(closeBrace.style, { fontStyle: "bold", color: "#880000", fontSize: "20px", marginLeft: "2px" });
    // endP.appendChild(closeBrace);

    // //startP~endP 侧边连续染色
    for (let i = noteData.startParagraphIndex; i <= noteData.endParagraphIndex; i++) {
        const p = paragraphs[i];
        p.dataset.noteId = noteData.noteId;
        if (!p) continue;

        p.style.borderLeft = "4px solid #880000";
        p.style.paddingLeft = "8px";
    }


    // //startP~endP bg: 浅灰色
    // for (let i = noteData.startParagraphIndex; i <= noteData.endParagraphIndex; i++) {
    //     const p = paragraphs[i];
    //     if (!p) continue;

    //     p.style.backgroundColor = "#f0f0f0";
    // }

    noteP = document.createElement("div");//默认style.display为block，另起一行
    // ----- marker -----
    const marker = document.createElement("span");
    marker.textContent = noteData.marker || "♥";
    marker.dataset.noteId = noteData.noteId;
    Object.assign(marker.style, { fontStyle: "bold", fontSize: "14px", color: "#880000", cursor: "pointer", marginLeft: "4px" });
    noteP.appendChild(marker);

    // ----- noteSpan -----
    const noteSpan = document.createElement("span");
    noteSpan.dataset.noteId = noteData.noteId;
    noteSpan.className = "ao3-note-text";

    if (!noteData.note || noteData.note.trim() === "xxx") {//如果没有note或note.strip为xxx
        noteSpan.textContent = " leave a note";//显示默认文字
        Object.assign(noteSpan.style, {
            fontStyle: "italic",
            color: "#888",
            backgroundColor: "#fff",
            marginLeft: "2px",
            cursor: "text",
        });
        noteSpan.dataset.placeholder = "true"; // 占位标识
    } else {
        noteSpan.textContent = " " + noteData.note.trim();
        Object.assign(noteSpan.style, {
            fontStyle: "italic",
            color: "#880000",
            // backgroundColor: "#f0f0f0",
            marginLeft: "2px",
            cursor: "text",
        });
        noteSpan.dataset.placeholder = "false";
    }

    noteP.appendChild(noteSpan);
    endP.insertAdjacentElement("afterend", noteP);//!!


    // // ----- marker -----
    // const marker = document.createElement("span");
    // marker.textContent = noteData.marker || "❤️";
    // marker.dataset.noteId = noteData.noteId;
    // Object.assign(marker.style, { fontStyle: "bold", fontSize: "14px", color: "#880000", cursor: "pointer", marginLeft: "2px" });
    // endP.appendChild(marker);

    // // ----- noteSpan -----
    // const noteSpan = document.createElement("span");
    // noteSpan.dataset.noteId = noteData.noteId;
    // noteSpan.className = "ao3-note-text";

    // if (!noteData.note || noteData.note.trim() === "xxx") {//如果没有note或note.strip为xxx
    //     noteSpan.textContent = " leave a note";//显示默认文字
    //     Object.assign(noteSpan.style, {
    //         fontStyle: "italic",
    //         color: "#888",
    //         backgroundColor: "#fff",
    //         marginLeft: "4px",
    //         cursor: "text",
    //     });
    //     noteSpan.dataset.placeholder = "true"; // 占位标识
    // } else {
    //     noteSpan.textContent = " " + noteData.note.trim();
    //     Object.assign(noteSpan.style, {
    //         fontStyle: "italic",
    //         color: "#880000",
    //         // backgroundColor: "#f0f0f0",
    //         marginLeft: "6px",
    //         cursor: "text",
    //     });
    //     noteSpan.dataset.placeholder = "false";
    // }

    // endP.appendChild(noteSpan);

    // ----- 行为绑定 -----
    enableInlineEdit(noteSpan, noteData);
    bindMarkerMenu(marker, noteSpan, noteData);

    return { marker, noteSpan };
}


// =======================================
// 2️⃣ 内联编辑行为
// =======================================

function enableInlineEdit(noteSpan, noteData) {
    noteSpan.onclick = () => {
        // 已经在编辑状态
        if (noteSpan.querySelector("input")) return;

        const oldText = (noteSpan.dataset.placeholder === "true") ? "" : noteData.note || "";
        const input = document.createElement("input");
        input.value = oldText;
        Object.assign(input.style, {
            fontSize: "0.85em",
            border: "1px solid #880000",
            padding: "2px 4px",
            borderRadius: "2px"
        });

        // 替换 noteSpan
        noteSpan.replaceWith(input);
        input.focus();

        const save = async () => {
            noteData.note = input.value.trim();
            await updateNote(noteData); //直接更新该notedata所以不用指定id!!
            // console.log("note updated!")

            // 更新 noteSpan 样式
            if (!noteData.note) {
                noteSpan.textContent = " leave a note";
                Object.assign(noteSpan.style, { fontStyle: "italic", color: "#888", backgroundColor: "#fff" });
                noteSpan.dataset.placeholder = "true";
            } else {
                noteSpan.textContent = " " + noteData.note;
                Object.assign(noteSpan.style, { fontStyle: "italic", color: "#880000", backgroundColor: "#f0f0f0" });
                noteSpan.dataset.placeholder = "false";
            }

            input.replaceWith(noteSpan);
        };

        input.addEventListener("blur", save);
        input.addEventListener("keydown", e => { if (e.key === "Enter") save(); });
    };
}


function bindMarkerMenu(marker, noteSpan, noteData) {
    const workId = noteData.workId;
    const chapterId = noteData.chapterId;

    marker.onclick = (e) => {
        e.stopPropagation();

        // 移除已有菜单
        const existingMenu = document.getElementById("marker-menu");
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement("div");
        menu.id = "marker-menu";
        Object.assign(menu.style, {
            position: "absolute",
            background: "#fff",
            border: "1px solid #ccc",
            padding: "4px",
            borderRadius: "4px",
            zIndex: 9999,
            display: "flex",
            gap: "4px"
        });

        // 删除
        const delBtn = document.createElement("button");//span
        delBtn.textContent = "Delete";
        Object.assign(delBtn.style, {
            padding: "4px",
            color: "#880000",
            fontSize: "12px"

        });
        // 删除添加的marker+note,取消侧边染色,不删除原文!
        delBtn.onclick = async () => {
            // 1️⃣ 删除数据库里的 note
            await deleteNote(noteData.noteId);

            // 2️⃣ 删除 marker 和 note 元素
            const allEls = document.querySelectorAll(`[data-note-id="${noteData.noteId}"]`);
            allEls.forEach(el => {
                // marker/noteSpan 是 <span> 或 <div>，放在段落内部
                // 如果是段落本身，保留它，只删除附加元素
                const tag = el.tagName.toLowerCase();
                if (tag === "span" || tag === "div") {
                    el.remove();
                }
            });

            // 3️⃣ 取消侧边染色（段落）
            const paragraphs = document.querySelectorAll("#workskin p");
            paragraphs.forEach(p => {
                if (!p.dataset.noteId) return;
                if (p.dataset.noteId === noteData.noteId) {
                    p.style.borderLeft = "";
                    p.style.paddingLeft = "";
                    delete p.dataset.noteId;
                }
            });

            // 4️⃣ 移除菜单本身
            menu.remove();
        };
        menu.appendChild(delBtn);


        // delBtn.onclick = async () => {
        //     await deleteNote(noteData.noteId);
        //     const allEls = document.querySelectorAll(`[data-note-id="${noteData.noteId}"]`);
        //     allEls.forEach(el => el.remove());
        //     menu.remove();
        //     await deleteNote(noteData.noteId);
        // };
        // menu.appendChild(delBtn);

        // 显示/隐藏
        const toggleBtn = document.createElement("button");
        toggleBtn.textContent = "Display note";
        Object.assign(toggleBtn.style, {
            padding: "4px",
            color: "#880000",
            fontSize: "12px",
            // marginLeft: "2px"

        });
        toggleBtn.onclick = () => {
            noteSpan.style.display = noteSpan.style.display === "none" ? "inline" : "none";
            menu.remove();
        };
        menu.appendChild(toggleBtn);

        document.body.appendChild(menu);
        const rect = marker.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY}px`;
        menu.style.left = `${rect.left + window.scrollX}px`;

        document.addEventListener("mousedown", function closeMenu(event) {
            if (!menu.contains(event.target) && event.target !== marker) {
                menu.remove();
                document.removeEventListener("mousedown", closeMenu);
            }
        });
    };
}



// =======================================
// 3️⃣ 刷新
// =======================================
function refreshNote(noteData, workId, chapterId) {
    // 删除旧 DOM，重新渲染
    document
        .querySelectorAll(`[data-note-id="${noteData.noteId}"]`)
        .forEach(el => el.remove());

    // const paragraphs = document.querySelectorAll("#workskin p");
    renderMarker(noteData, workId, chapterId);
}

// =======================================
// 5️⃣ 主渲染函数
// =======================================

function renderMarker(noteData, workId, chapterId) {
    const { marker, noteSpan } = renderMarkerUI(noteData);
    //已包括renderUI，inline edit和menu
}


async function renderMarkersForChapter(workId, chapterId) {
    const notes = await loadNotesByWork(workId);
    notes
        .filter(n => n.chapterId === chapterId)  // 只渲染当前章
        .forEach(note => renderMarkerUI(note));
}




//========================================EMOJIS ROW============================================
// LOCAL version
const EMOJI_KEY = "ao3-emojis";

function getEmojis() {
    let stored = localStorage.getItem(EMOJI_KEY);

    if (!stored) {
        // const initial = ["❤️", "🔥", "✨", "😭", "💔"];
        const initial = ["𝑝𝑠.", "❤︎⁠", "⋮"];
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

    Object.assign(container.style, {
        display: "flex",
        flexWrap: "wrap",      // 自动换行
        gap: "5px",             // 间距
        padding: "4px 6px"
    });

    emojis.forEach(e => {
        const item = document.createElement("span");
        item.textContent = e;
        item.dataset.val = e;

        // 每个 emoji 固定宽度，让一行最多 5个
        Object.assign(item.style, {
            width: "15%",        // ⭐ 100% / 5 ≈ 20%，留点 gap
            textAlign: "center",
            padding: "2px 0",
            borderRadius: "6px",
            cursor: "pointer",
            userSelect: "none",
            fontSize: "14px",
            color: "#880000",
            boxSizing: "border-box"
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
    input.placeholder = "Add a marker";
    input.style.flex = "1";
    input.style.border = "1px solid #ccc";
    input.style.borderRadius = "6px";
    input.style.padding = "4px";

    const addBtn = document.createElement("button");// span则无框！
    addBtn.textContent = "add";
    // ⭐ 无边框按钮风格
    Object.assign(addBtn.style, {
        cursor: "pointer",
        color: "#880000",
        fontSize: "14px",
        opacity: "0.85",
        padding: "6px 6px"
    });


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

    const delBtn = document.createElement("button");// span则无框！
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

// 选中文字后显示/渲染emojirow
function renderEmojiRow(container) {
    container.innerHTML = "";

    const emojis = getEmojis();

    emojis.forEach(e => {
        const span = document.createElement("span");
        span.textContent = e;
        span.className = "ao3-emoji";
        // span.style.display = "flex";
        span.style.cursor = "pointer";
        span.style.color = "#880000";
        span.style.padding = "4px 6px",
            span.style.fontStyle = "bold",
            span.style.fontSize = "14px",
            span.onclick = () => {
                createNoteWithEmoji(e);
            };

        container.appendChild(span);
    });

    // emoji manager button
    const manageBtn = document.createElement("span");
    manageBtn.textContent = " ⋮ ";
    Object.assign(manageBtn.style, {
        cursor: "pointer",
        color: "#880000",
        fontSize: "14px",
        fontStyle: "bold",
        opacity: "0.85",
        padding: "4px 6px"
    });

    manageBtn.onclick = () => showEmojiManager(manageBtn);
    container.appendChild(manageBtn);

}


// 找当前页面上的 emoji row，清空row，重新按 storage 渲染
function refreshEmojiRow() {
    const row = document.querySelector(".ao3-emoji-row");
    if (row) renderEmojiRow(row);
}



// ====================================== 创建笔记函数 ==================================
async function createNoteWithEmoji(markerEmoji) {
    if (!currentSelectedText || currentStartParagraphIndex == null || currentEndParagraphIndex === null) return;

    const meta = getWorkMeta();
    const workId = meta.workId;
    const author = meta.author;
    const title = meta.title;
    const fandom = meta.fandom;
    const chapterId = meta.chapterId
    const chapterName = meta.chapterName

    const noteData = {
        noteId: Date.now().toString(),

        workId,
        author,
        fandom,
        title,
        chapterId,
        chapterName,

        text: currentSelectedText,
        note: "xxx",
        marker: markerEmoji || "📝",
        startParagraphIndex: currentStartParagraphIndex,
        endParagraphIndex: currentEndParagraphIndex,
        time: Date.now()
    };

    // ✅ IndexedDB 保存
    await createNoteWithEmojiIndexed(noteData);

    // 渲染 marker
    renderMarker(noteData, workId, chapterId);

    // 清理缓存
    currentSelectedText = "";
    currentStartParagraphIndex = null;
    currentEndParagraphIndex = null;
    if (emojiUI) removeEmojiUI();

    console.log("New note created:", noteData);
}





// =================================== NOTE PAD ====================================
// function scrollToNote(note) {

//     const paragraphs = document.querySelectorAll("#workskin p");
//     if (!paragraphs.length) return;

//     // ⭐ 兼容旧数据（没有 startIndex）
//     const start = note.startParagraphIndex ?? note.endParagraphIndex;
//     const end = note.endParagraphIndex;

//     if (start == null || end == null) return;

//     const from = Math.min(start, end);
//     const to = Math.max(start, end);

//     // ⭐ 滚动到中间位置（更自然）
//     // const mid = paragraphs[Math.floor((from + to) / 2)];
//     // if (!mid) return;
//     // mid.scrollIntoView({
//     //     behavior: "smooth",
//     //     block: "center"
//     // });

//     // 最后一段滚到页面中间
//     const index = Math.min(to, paragraphs.length - 1);
//     const last = paragraphs[index];
//     if (!last) return;

//     last.scrollIntoView({
//         behavior: "smooth",
//         block: "center"
//     });


//     // ⭐ 高亮范围
//     const highlighted = [];

//     for (let i = from; i <= to; i++) {

//         const p = paragraphs[i];
//         if (!p) continue;

//         p.style.transition = "background 0.6s";
//         p.style.background = "#fff2a8";

//         highlighted.push(p);
//     }

//     // ⭐ 自动取消高亮
//     setTimeout(() => {
//         highlighted.forEach(p => {
//             p.style.background = "";
//         });
//     }, 1500);
// }

function scrollToNote(note) {

    const paragraphs = document.querySelectorAll("#workskin p");
    if (!paragraphs.length) return;

    const from = Math.min(note.startParagraphIndex, note.endParagraphIndex);
    const to = Math.max(note.startParagraphIndex, note.endParagraphIndex);

    const index = Math.min(to, paragraphs.length - 1);
    const target = paragraphs[index];
    if (!target) return;

    // ⭐⭐⭐ 滚动到页面 1/3 位置（避免被底部 panel 遮挡）
    const rect = target.getBoundingClientRect();
    const absoluteY = rect.top + window.scrollY;

    const viewportOffset = window.innerHeight / 4;//滚动到页面上半部分四分之一的位置

    window.scrollTo({
        top: absoluteY - viewportOffset,
        behavior: "smooth"
    });

    // ⭐ 高亮范围
    const highlighted = [];

    for (let i = from; i <= to; i++) {
        const p = paragraphs[i];
        if (!p) continue;

        p.style.transition = "background 0.4s";
        p.style.background = "#fff2a8";

        highlighted.push(p);
    }

    // ⭐ 自动取消高亮
    setTimeout(() => {
        highlighted.forEach(p => p.style.background = "");
    }, 1500);
}


function createNotesPanel() {
    // notepad初始格式：位置，my notes标题，关闭按钮，点击空白关闭

    // 删除已有面板
    const existing = document.getElementById("notes-panel");
    if (existing) existing.remove();

    const panel = document.createElement("div");

    panel.id = "notes-panel";
    Object.assign(panel.style, {
        position: "fixed",
        bottom: "0",
        left: "0",
        width: "99%",
        height: "50%",        // 占屏下半
        background: "#f8f8f8",
        boxShadow: "0 -2px 6px rgba(0,0,0,0.2)",
        zIndex: 99999,
        padding: "12px",
        overflowY: "auto",//上下滑动
        overflowX: "hidden",//?
        fontFamily: "sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        borderTopLeftRadius: "8px",
        borderTopRightRadius: "8px"
    });

    // 关闭按钮
    const closeBtn = document.createElement("span");
    closeBtn.textContent = "×";
    Object.assign(closeBtn.style, {
        position: "absolute",
        top: "6px",
        right: "12px",
        fontSize: "20px",
        fontWeight: "bold",
        cursor: "pointer",
        color: "#880000"
    });
    closeBtn.onclick = () => panel.remove();
    panel.appendChild(closeBtn);

    // 点击空白关闭
    setTimeout(() => { // 延迟绑定，防止立即触发自身
        document.addEventListener("mousedown", function closePanel(e) {
            if (!panel.contains(e.target)) {
                panel.remove();
                document.removeEventListener("mousedown", closePanel);
            }
        });
    }, 0);

    // 大标题
    const titleEl = document.createElement("h2");
    titleEl.textContent = "My Notes";
    Object.assign(titleEl.style, { margin: "0 0 8px 0", color: "#880000", fontSize: "20px", fontWeight: "bold" });
    panel.appendChild(titleEl)
    return panel;
}


// function renderChapters(panel, notes, currentChapterId) {
//     //输入当前作品的所有notes，展开当前的chap的notes，其余折叠

//     // ========================
//     // 1️⃣ 给扁平数据建立层级，work -> chapter -> notes 
//     // ========================
//     const worksMap = {};

//     notes.forEach(note => {
//         if (!worksMap[note.workId]) {
//             worksMap[note.workId] = {
//                 title: note.title || "Untitled",
//                 author: note.author || "Anonymous",
//                 fandom: note.fandom || "Unknown fandom",
//                 chapters: {}
//             };
//         }

//         const chapters = worksMap[note.workId].chapters;

//         if (!chapters[note.chapterId]) {
//             chapters[note.chapterId] = {
//                 name: note.chapterName,
//                 notes: []
//             };
//         }

//         chapters[note.chapterId].notes.push(note);
//     });


//     // ========================
//     // 2️⃣ 渲染 work
//     // ========================
//     Object.keys(worksMap).forEach(workId => {
//         const work = worksMap[workId];

//         // Work Header
//         const workHeader = document.createElement("div");
//         Object.assign(workHeader.style, {
//             fontFamily: "Georgia, 'Times New Roman', serif",
//             fontStyle: "italic"
//         });

//         // XXXXX 计算 totalNotes
//         const totalNotes = Object.values(work.chapters)
//             .reduce((sum, chapter) => sum + chapter.notes.length, 0);

//         workHeader.textContent = `•  ${work.title} | by ${work.author} | ${work.fandom} | ${totalNotes} note${totalNotes !== 1 ? "s" : ""}`;
//         // workHeader.textContent = work.title;


//         Object.assign(workHeader.style, {
//             fontSize: "14px",
//             fontWeight: "bold",
//             color: '#404040',//"#880000",
//             fontStyle: "italic",
//             cursor: "pointer",
//             marginTop: "6px",
//             marginBottom: '2px',
//             paddingBottom: "2px",
//             // borderBottom: "2px solid #404040"
//         });

//         // Work Content:包括chaps不包括work header
//         const workContent = document.createElement("div");
//         Object.assign(workContent.style, {
//             display: "flex",
//             flexDirection: "column",
//             gap: "10px",
//             marginLeft: "5px",
//             // border: "1px solid #ccc",
//             // ShadowRoot: "#555",
//             // backgroundColor: "#fff",

//         });

//         // 折叠
//         workHeader.onclick = () => {
//             workContent.style.display =
//                 workContent.style.display === "none" ? "flex" : "none";
//         };


//         // ========================
//         // 3️⃣ 渲染 chapter
//         // ========================
//         Object.keys(work.chapters)
//             .sort()
//             .forEach(chapterId => {

//                 const chapter = work.chapters[chapterId];
//                 const chapterHeader = document.createElement("div");
//                 chapterHeader.textContent = chapter.name;

//                 Object.assign(chapterHeader.style, {
//                     display: "flex",
//                     alignItems: "center",
//                     textAlign: "center",
//                     fontSize: "12px",
//                     color: "#555",
//                     cursor: "pointer",
//                     margin: "8px 0"
//                 });
//                 const lineLeft = document.createElement("div");
//                 const lineRight = document.createElement("div");

//                 [lineLeft, lineRight].forEach(line => {
//                     Object.assign(line.style, {
//                         flex: "1",
//                         height: "1px",
//                         background: "#ccc"
//                     });
//                 });
//                 const label = document.createElement("span");
//                 label.textContent = chapter.name;

//                 Object.assign(label.style, {
//                     padding: "0 8px",
//                     whiteSpace: "nowrap",
//                     fontStyle: "italic"
//                 });
//                 chapterHeader.textContent = "";
//                 chapterHeader.appendChild(lineLeft);
//                 chapterHeader.appendChild(label);
//                 chapterHeader.appendChild(lineRight);



//                 const chapterContent = document.createElement("div");

//                 Object.assign(chapterContent.style, {
//                     display: chapterId === currentChapterId ? "flex" : "none",
//                     flexDirection: "column",
//                     gap: "10px",              // ⭐ 笔记间距
//                     marginLeft: "5px",
//                     marginTop: "4px"
//                 });

//                 // 折叠章节
//                 chapterHeader.onclick = () => {
//                     chapterContent.style.display =
//                         chapterContent.style.display === "none" ? "flex" : "none";
//                 };

//                 // ========================
//                 // 4️⃣ 渲染 notes
//                 // ========================
//                 chapter.notes.forEach(note => {
//                     const noteRow = renderNoteRow(note);

//                     // ⭐ 轻量视觉分隔（不改原函数）
//                     Object.assign(noteRow.style, {
//                         paddingBottom: "4px",
//                         // borderBottom: "1px solid #eee"
//                     });

//                     chapterContent.appendChild(noteRow);
//                 });

//                 workContent.appendChild(chapterHeader);
//                 workContent.appendChild(chapterContent);
//             });

//         panel.appendChild(workHeader);
//         panel.appendChild(workContent);
//     });
// }


// ========================
// 4️⃣ 渲染单条笔记行
// margin = 元素之间距离
// padding = 内容与边框距离
// ========================


//V2 ：renderChapters+createChapterElement
function renderChapters(panel, notes, currentWorkId, currentChapterId) {
    // ========================
    // 1️⃣ 给扁平数据建立层级，work -> chapter -> notes 
    // ========================
    const worksMap = {};

    notes.forEach(note => {
        if (!worksMap[note.workId]) {
            worksMap[note.workId] = {
                title: note.title || "Untitled",
                author: note.author || "Anonymous",
                fandom: note.fandom || "Unknown fandom",
                chapters: {}
            };
        }

        const chapters = worksMap[note.workId].chapters;

        if (!chapters[note.chapterId]) {
            chapters[note.chapterId] = {
                name: note.chapterName,
                notes: []
            };
        }

        chapters[note.chapterId].notes.push(note);
    });

    // ========================
    // 2️⃣ 渲染 work
    // ========================
    Object.keys(worksMap).forEach(workId => {
        const work = worksMap[workId];
        // // ----------------------------
        // 1️⃣ 添加红色分割线
        // ----------------------------
        const divider = document.createElement("div");
        Object.assign(divider.style, {
            height: "3px",           // 线条粗细
            backgroundColor: "#880000", // 红色
            margin: "5px 0",         // 上下间距
            width: "100%",
            boxSizing: "border-box"

        });
        panel.appendChild(divider); // 插入到 panel 中


        // Work Header
        // ----------------------------
        // 1️⃣ 添加红色分割线
        // ----------------------------
        // const divider = document.createElement("div");
        // Object.assign(divider.style, {
        //     height: "3px",           // 线条粗细
        //     backgroundColor: "#880000", // 红色
        //     margin: "8px 0",         // 上下间距
        //     width: "100%",
        // });
        // panel.appendChild(divider); // 插入到 panel 中


        const workHeader = document.createElement("div");
        Object.assign(workHeader.style, {
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic"
        });

        const totalNotes = Object.values(work.chapters)
            .reduce((sum, chapter) => sum + chapter.notes.length, 0);

        workHeader.textContent = `•  ${work.title} | by ${work.author} | ${work.fandom} | ${totalNotes} note${totalNotes !== 1 ? "s" : ""}`;

        Object.assign(workHeader.style, {
            fontSize: "13px",
            fontWeight: "bold",
            color: '#404040',
            fontStyle: "italic",
            cursor: "pointer",
            marginTop: "6px",
            marginBottom: '2px',
            paddingBottom: "2px",
        });

        // Work Content: 容器，用于放章节
        const workContent = document.createElement("div");
        Object.assign(workContent.style, {
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginLeft: "5px",
        });

        // ------------------
        // MOD: 非当前 work 默认折叠且暂不渲染章节
        // ------------------
        if (workId !== currentWorkId) {
            workContent.style.display = "none"; // 折叠
        }

        // ------------------
        // MOD: 点击 workHeader 时动态渲染章节
        // ------------------
        workHeader.onclick = () => {
            if (workContent.style.display === "none") {
                workContent.style.display = "flex";

                // 只在第一次展开时渲染章节
                if (!workHeader.dataset.loaded) {
                    Object.keys(work.chapters)
                        .sort()
                        .forEach(chapterId => {
                            const chapter = work.chapters[chapterId];
                            createChapterElement(workContent, chapter, chapterId, currentChapterId);
                        });
                    workHeader.dataset.loaded = "true";
                }
            } else {
                workContent.style.display = "none";
            }
        };

        // ------------------
        // MOD: 当前作品直接渲染章节
        // ------------------
        if (workId === currentWorkId) {
            Object.keys(work.chapters)
                .sort()
                .forEach(chapterId => {
                    const chapter = work.chapters[chapterId];
                    createChapterElement(workContent, chapter, chapterId, currentChapterId);
                });
            workHeader.dataset.loaded = "true";
        }

        panel.appendChild(workHeader);
        panel.appendChild(workContent);
    });
}

// ========================
// MOD: 将章节渲染逻辑单独抽离，支持 lazy load notes
// ========================
function createChapterElement(workContent, chapter, chapterId, currentChapterId) {
    const chapterHeader = document.createElement("div");

    const lineLeft = document.createElement("div");
    const lineRight = document.createElement("div");

    [lineLeft, lineRight].forEach(line => {
        Object.assign(line.style, {
            flex: "1",
            height: "1px",
            background: "#ccc"
        });
    });

    const label = document.createElement("span");
    label.textContent = chapter.name;
    Object.assign(label.style, {
        padding: "0 8px",
        whiteSpace: "nowrap",
        fontStyle: "italic"
    });

    chapterHeader.textContent = "";
    chapterHeader.appendChild(lineLeft);
    chapterHeader.appendChild(label);
    chapterHeader.appendChild(lineRight);

    Object.assign(chapterHeader.style, {
        display: "flex",
        alignItems: "center",
        textAlign: "center",
        fontSize: "12px",
        color: "#555",
        cursor: "pointer",
        margin: "8px 0"
    });

    const chapterContent = document.createElement("div");
    Object.assign(chapterContent.style, {
        display: chapterId === currentChapterId ? "flex" : "none", // MOD: 当前章节展开
        flexDirection: "column",
        gap: "10px",
        marginLeft: "5px",
        marginTop: "4px"
    });

    // ------------------
    // MOD: 点击 chapterHeader 时渲染 notes
    // ------------------
    chapterHeader.onclick = () => {
        if (chapterContent.style.display === "none") {
            chapterContent.style.display = "flex";

            // lazy load notes
            if (!chapterHeader.dataset.loaded) {
                chapter.notes.forEach(note => {
                    const noteRow = renderNoteRow(note);
                    Object.assign(noteRow.style, { paddingBottom: "4px" });
                    chapterContent.appendChild(noteRow);
                });
                chapterHeader.dataset.loaded = "true";
            }
        } else {
            chapterContent.style.display = "none";
        }
    };

    // ------------------
    // MOD: 当前章节直接渲染 notes
    // ------------------
    //先按照startPindex排序
    chapter.notes.sort((a, b) => a.startParagraphIndex - b.startParagraphIndex);

    if (chapterId === currentChapterId) {
        chapter.notes.forEach(note => {
            const noteRow = renderNoteRow(note);
            Object.assign(noteRow.style, { paddingBottom: "4px" });
            chapterContent.appendChild(noteRow);
        });
        chapterHeader.dataset.loaded = "true";
    }

    workContent.appendChild(chapterHeader);
    workContent.appendChild(chapterContent);
}



function renderNoteRow(note) {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "3px";
    container.style.marginLeft = "5px";

    // text preview
    const textEl = document.createElement("span");
    const fullText = note.text || "……";
    const previewText = fullText.length > 24
        ? fullText.slice(0, 30) + "……" + fullText.slice(-30)
        : fullText;
    textEl.textContent = previewText;
    Object.assign(textEl.style, { fontSize: "12px", color: "#404040", cursor: "pointer" });

    // scroll:点击文本回滚
    // const backBtn = document.createElement("↩");
    textEl.onclick = () => {
        const currentChapter = getCurrentChapter().id;
        if (currentChapter === note.chapterId) {
            // 已在本章 → 滚动定位
            scrollToNote(note);

        } else {

            // 不在本章 → 跳转章节
            //保存note数据到session！
            sessionStorage.setItem(
                "jumpToNote",
                JSON.stringify(note)
            );
            const url = `/works/${note.workId}/chapters/${note.chapterId}`;
            window.location.href = url;
        }
    };

    // note
    const noteEl = document.createElement("span");
    noteEl.textContent = note.note || "";
    Object.assign(noteEl.style, {
        fontSize: "10px", fontStyle: "italic", color: "#880000",
        marginLeft: "2px", cursor: "text", marginBottom: "6px",
    });

    // Panel 内支持 inline edit ： text + note
    // enableInlineEditPanel(textEl, note, "text");
    enableInlineEditPanel(noteEl, note, "note");


    container.appendChild(textEl);
    container.appendChild(noteEl);
    return container;
}

// ========================
// 5️⃣ inline edit
// ========================

function enableInlineEditPanel(el, noteData, field) {
    el.onclick = (e) => {
        e.stopPropagation();
        // 避免重复创建 input
        if (el.querySelector("input")) return;

        const oldValue = noteData[field] || "";
        const input = document.createElement("input");
        input.value = oldValue;
        Object.assign(input.style, {
            fontSize: "14px",
            border: "1px solid #880000",
            padding: "2px 4px",
            borderRadius: "2px",
            width: "100%"
        });

        el.replaceWith(input);
        input.focus();

        const save = async () => {
            noteData[field] = input.value;
            await updateNote(noteData); // 更新数据库或内存
            refreshNote(noteData, noteData.workId, noteData.chapterId);//更新

            el.textContent = input.value;
            input.replaceWith(el);
        };

        input.addEventListener("blur", save);
        input.addEventListener("keydown", e => { if (e.key === "Enter") save(); });
    };
}

// ========================
// 6️⃣ 主入口
// ========================
// async function showNotesSummary(workId, currentChapterId) {
//     const panel = createNotesPanel();
//     const allNotes = await loadAllNotes(); // [{workId, chapterId, ...}, ...]

//     const notes = await loadNotesByWork(workId); // 获取该作品所有笔记
//     // console.log("notes of this work:", notes)
//     // renderWorkInfo(panel, notes);
//     renderChapters(panel, notes, currentChapterId);

//     document.body.appendChild(panel);//** */
// }

// ========================
// 6️⃣ 主入口：全局 lazy load
// ========================
async function showNotesSummary(workId, currentChapterId) {
    const panel = createNotesPanel();

    // ------------------
    // MOD: 加载所有作品笔记，而不是只当前作品
    // ------------------
    const allNotes = await loadAllNotes(); // [{workId, chapterId, ...}, ...]

    renderChapters(panel, allNotes, workId, currentChapterId); // MOD: 传入 currentWorkId
    document.body.appendChild(panel);
}




// ====== Panel Marker（右上角按钮） ======
const panelMarker = document.createElement("span");
panelMarker.textContent = "🗎"; // 面板图标
Object.assign(panelMarker.style, {
    position: "fixed",
    top: "10px",
    right: "10px",
    fontStyle: "bold",
    fontSize: "24px",
    color: "#880000",
    cursor: "pointer",
    zIndex: 99999
});
document.body.appendChild(panelMarker);

panelMarker.onclick = async () => {
    const existing = document.getElementById("notes-panel");
    if (existing) { console.log("Panel already exists"); return; }

    const workId = getWorkId();
    const currentChapterId = getCurrentChapter()?.id;

    if (!workId || !currentChapterId) return;

    await showNotesSummary(workId, currentChapterId);

};




// Lazy Fetch（延迟加载）
/*
🔍 Search
————————————
▶ 当前作品 (展开)
    ▶ Chapter 1
    ▶ Chapter 2

▶ 其他作品A (折叠)
▶ 其他作品B (折叠)
▶ 其他作品C (折叠)
*/




// =================================== 事件监听 (放最后) ============================

let emojiUI = null;
let currentSelectedText = ""; // 全局变量，保存当前选中文字
let currentStartParagraphIndex = null;
let currentEndParagraphIndex = null;

// ---------------- 选区监听 -----------------
document.addEventListener("selectionchange", () => {
    //这一段sel不会消失

    // text
    const sel = window.getSelection();
    const text = sel.toString().trim();
    if (text.length < 1) return;
    currentSelectedText = text;
    // console.log("Show currentSelectedText:", currentSelectedText);

    //lastpidx
    currentStartParagraphIndex = getStartParagraphIndexFromRange(sel.getRangeAt(0));
    currentEndParagraphIndex = getEndParagraphIndexFromRange(sel.getRangeAt(0));
    // console.log('startpindex, endpindex', currentStartParagraphIndex, currentEndParagraphIndex)

    // 显示 emoji row
    showEmojiRowAtSelection(sel);
});



// ---------------- Emoji Row 显示函数 ----------------
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

function removeEmojiUI() {
    if (emojiUI) {
        emojiUI.remove();
        emojiUI = null;
    }
}


// Object.assign(panel.style, {
//         position: "absolute",
//         background: "white",
//         border: "1px solid #ddd",
//         borderRadius: "10px",
//         padding: "10px",
//         zIndex: 999999,

//         maxWidth: "92vw",        // ✅ 不超过屏幕
//         boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
//         fontSize: "16px"
//     });



//---------------- 页面加载时重新渲染marker----------------

window.addEventListener("load", async () => {
    const workId = getWorkId();
    const currentChapterId = getCurrentChapter().id

    // const chapterId = getCurrentChapterID(); // 当前章节
    await renderMarkersForChapter(workId, currentChapterId);


    //跳转后有jumpToNote临时保存则scroll
    const pending = sessionStorage.getItem("jumpToNote");

    if (pending) {
        console.log("scroll from other chap!")

        sessionStorage.removeItem("jumpToNote");

        const note = JSON.parse(pending);

        // ⭐ 等 AO3 页面完全布局好再滚动
        setTimeout(() => {
            scrollToNote(note);
        }, 350);
    }



});
