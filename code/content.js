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

// Meta main 
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
// 弹窗 固定在屏幕底部 (position: fixed; bottom:0)

// 弹窗高度占屏幕 50%-60% (maxHeight: 60%)

// 文本框使用 <textarea> 并 flex: 1 → 占面板大部分高度，内部可滚动

// 按钮行靠右下 (justify-content: flex-end)

// 不阻止原文滚动，用户可以上下浏览文章

// 点击面板外或 marker 再点击 → 弹窗关闭

function getContextText(noteData) {
    const text = noteData.text || "";
    const len = text.length;

    const before = text.slice(0, 10); // 前10字符
    const after = text.slice(len - 10, len); // 后10字符

    if (len <= 20) {
        // 太短就直接全部显示
        return text;
    } else {
        return `${before}…${after}`;
    }
}


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

    // 2️⃣ 创建笔记显示 span（小字体斜体，浅灰背景，仅当有内容时显示）
    const noteSpan = document.createElement("span");
    const hasNote = noteData.note && noteData.note.trim() !== "";

    // 文本内容显示
    noteSpan.textContent = hasNote ? " " + noteData.note.trim() : "";
    noteSpan.style.display = hasNote ? "inline" : "none";

    // 样式统一设置
    Object.assign(noteSpan.style, {
        fontStyle: "italic",
        fontSize: "0.85em",
        color: "#880000",
        background: "#f0f0f0",
        marginLeft: "4px",
        padding: "1px 3px",
        borderRadius: "3px"
    });


    p.appendChild(marker);
    p.appendChild(noteSpan);

    // 3️⃣ 点击 marker 弹出底部面板
    marker.onclick = () => {
        // 移除已有面板
        const existingPanel = document.getElementById("marker-bottom-panel");
        if (existingPanel) existingPanel.remove();

        const panel = document.createElement("div");
        panel.id = "marker-bottom-panel";

        Object.assign(panel.style, {
            position: "fixed",
            bottom: "0",
            left: "0",
            width: "100%",
            maxHeight: "60%",        // 占屏幕下方50%-60%
            background: "#fff",
            borderTop: "1px solid #ccc",
            borderRadius: "8px 8px 0 0",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            padding: "8px",
            boxShadow: "0 -2px 6px rgba(0,0,0,0.2)",
            overflow: "hidden"       // 面板内部 scroll
        });


        // ======= 上方提示 + help =======
        const topRow = document.createElement("div");
        Object.assign(topRow.style, {
            display: "flex",
            width: "98%",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "4px"
        });

        // 上方原文提示
        const contextDiv = document.createElement("div");
        contextDiv.textContent = getContextText(noteData);
        Object.assign(contextDiv.style, {
            fontSize: "12px",
            fontStyle: "italic",
            color: "#888",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: "1" // 占满剩余空间
        });

        // 右侧 help 图标：点击显示内容，点击空白处关闭
        const helpIcon = document.createElement("span");
        helpIcon.textContent = " 𝒊 ";
        Object.assign(helpIcon.style, {
            cursor: "help",
            color: "#880000",
            fontSize: "14px",
            marginLeft: "6px",
            flex: "0 0 auto" // 不拉伸
        });
        // helpIcon.title = "Save 保存，Delete 删除，Display 显示笔记";


        // append 到同一行
        topRow.appendChild(contextDiv);
        topRow.appendChild(helpIcon);

        // append 到面板上方
        panel.appendChild(topRow);


        // ===== 文本框（多行可滚动） =====
        const input = document.createElement("textarea");
        input.value = noteData.note || "";
        Object.assign(input.style, {
            flex: "1",              // 占据大部分高度
            boxSizing: "border-box",  //padding + border + width=100%容易超出，指定包含 padding 和 border
            width: "98%",
            resize: "none",
            fontSize: "14px",
            padding: "6px",
            overflowY: "auto",
            marginBottom: "8px",
            borderRadius: "4px",
            border: "1px solid #ccc"
        });

        panel.appendChild(input);

        // ===== 按钮行（靠右下） =====
        const btnRow = document.createElement("div");
        Object.assign(btnRow.style, {
            display: "flex",
            width: "98%",
            justifyContent: "flex-end",//靠末尾
            gap: "6px"
        });

        //----- save -----
        const saveBtn = document.createElement("button");
        saveBtn.textContent = "save";
        Object.assign(saveBtn.style, {
            cursor: "pointer",
            color: "#880000",
            fontSize: "14px",
            opacity: 0.85,
            padding: "4px 6px"
        });
        saveBtn.onclick = async () => {
            noteData.note = input.value;
            noteSpan.textContent = input.value ? " " + input.value : "";
            if (input.value) noteSpan.style.display = "inline";
            await updateNote(noteData);
            panel.remove();
        };

        //-----delete-----
        const delBtn = document.createElement("button");
        delBtn.textContent = "delete";
        Object.assign(delBtn.style, {
            cursor: "pointer",
            color: "#880000",
            fontSize: "14px",
            opacity: 0.85,
            padding: "4px 6px"
        });
        delBtn.onclick = async () => {
            marker.remove();
            noteSpan.remove();
            await deleteNote(noteData.noteId);
            panel.remove();
        };

        //-----dislpay-----
        let showNote = true;
        const showBtn = document.createElement("button");
        showBtn.textContent = "display";
        Object.assign(showBtn.style, {
            cursor: "pointer",
            color: "#880000",
            fontSize: "14px",
            opacity: 0.85,
            padding: "4px 6px"
        });
        showBtn.onclick = () => {
            showNote = !showNote;
            const hasNote = noteData.note && noteData.note.trim() !== "";
            noteSpan.style.display = showNote && hasNote ? "inline" : "none";
        };

        btnRow.appendChild(saveBtn);
        btnRow.appendChild(delBtn);
        btnRow.appendChild(showBtn);
        // btnRow.appendChild(helpIcon);

        panel.appendChild(btnRow);

        document.body.appendChild(panel);

        // 点击面板外关闭
        const closePanel = (e) => {
            if (!panel.contains(e.target) && e.target !== marker) {
                panel.remove();
                document.removeEventListener("mousedown", closePanel);
            }
        };
        document.addEventListener("mousedown", closePanel);
    };
}

async function renderNotesForChapter(workId, chapterId) {
    const notes = await loadNotesByWork(workId);
    notes
        .filter(n => n.chapterId === chapterId)  // 只渲染当前章
        .forEach(note => renderMarker(note, note.workId, note.chapterId));
}




//========================================EMOJIS ROW============================================
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

    Object.assign(container.style, {
        display: "flex",
        flexWrap: "wrap",      // 自动换行
        gap: "6px"              // 间距
    });

    emojis.forEach(e => {
        const item = document.createElement("span");
        item.textContent = e;
        item.dataset.val = e;

        // 每个 emoji 固定宽度，让一行最多 5 个
        Object.assign(item.style, {
            width: "18%",        // ⭐ 100% / 5 ≈ 20%，留点 gap
            textAlign: "center",
            padding: "3px 0",
            borderRadius: "6px",
            cursor: "pointer",
            userSelect: "none",
            fontSize: "16px",
            boxSizing: "border-box"
        });

        // emojis.forEach(e => {
        //     const item = document.createElement("span");
        //     item.textContent = e;
        //     item.dataset.val = e;

        //     Object.assign(item.style, {
        //         padding: "3px 5px",
        //         borderRadius: "6px",
        //         cursor: "pointer",
        //         userSelect: "none",
        //         fontSize: "16px"
        //     });

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
        color: "#880000",//"#007aff",
        fontSize: "14px",
        opacity: "0.85",
        padding: "4px 6px"
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

        span.onclick = () => {
            createNoteWithEmoji(e);
        };

        container.appendChild(span);
    });

    // emoji manager button
    const manageBtn = document.createElement("span");
    manageBtn.textContent = " […] ";
    Object.assign(manageBtn.style, {
        cursor: "pointer",
        color: "#880000",
        fontSize: "14px",
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





// =================================== NOTE PAD ====================================
function showNotesSummary(workId) {
    const allNotes = JSON.parse(localStorage.getItem("ao3notes") || "{}");
    if (!allNotes[workId]) return;

    const workData = allNotes[workId];

    // 创建面板
    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "fixed",
        top: "10px",
        right: "10px",
        width: "90%",
        maxHeight: "90%",
        overflowY: "auto",
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: "8px",
        padding: "8px",
        zIndex: 9999,
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
    });

    const title = document.createElement("h3");
    title.textContent = `${workData.title} - ${workData.author}`;
    title.style.marginBottom = "8px";
    panel.appendChild(title);

    // 遍历章节
    Object.keys(workData.notes).forEach(chapterId => {
        const chapterNotes = workData.notes[chapterId];

        const chapDiv = document.createElement("div");
        chapDiv.style.marginBottom = "6px";

        const chapTitle = document.createElement("div");
        chapTitle.textContent = `Chapter ${chapterId}`;
        chapTitle.style.fontWeight = "bold";
        chapTitle.style.cursor = "pointer";

        // 折叠章节
        const notesContainer = document.createElement("div");
        notesContainer.style.display = "none";
        notesContainer.style.marginLeft = "8px";

        chapTitle.onclick = () => {
            notesContainer.style.display =
                notesContainer.style.display === "none" ? "block" : "none";
        };

        // 每条笔记
        chapterNotes.forEach(note => {
            const noteDiv = document.createElement("div");
            noteDiv.style.marginBottom = "4px";
            noteDiv.style.padding = "2px 4px";
            noteDiv.style.borderBottom = "1px solid #eee";
            noteDiv.style.fontSize = "14px";

            noteDiv.textContent = `${note.marker} "${note.text}" ${note.note ? `- ${note.note}` : ""}`;

            // 点击可以高亮原文或者打开编辑
            noteDiv.onclick = () => {
                alert(`Original text: ${note.text}\nNote: ${note.note || "(empty)"}`);
                // 可在这里复用 renderMarker menu 或跳转到原文
            };

            notesContainer.appendChild(noteDiv);
        });

        chapDiv.appendChild(chapTitle);
        chapDiv.appendChild(notesContainer);
        panel.appendChild(chapDiv);
    });

    document.body.appendChild(panel);

    // 点击空白关闭
    setTimeout(() => {
        document.addEventListener("mousedown", closePanel);
    }, 0);

    function closePanel(e) {
        if (!panel.contains(e.target)) {
            panel.remove();
            document.removeEventListener("mousedown", closePanel);
        }
    }
}










// =================================== 事件监听 (放最后) ============================

let emojiUI = null;
let currentSelectedText = ""; // 全局变量，保存当前选中文字
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
    currentEndParagraphIndex = getEndParagraphIndexFromRange(sel.getRangeAt(0));


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



//---------------- 页面加载时重新渲染marker----------------

window.addEventListener("load", async () => {
    const workId = getWorkId();
    const chapterId = getCurrentChapterID(); // 当前章节
    await renderNotesForChapter(workId, chapterId);
});
