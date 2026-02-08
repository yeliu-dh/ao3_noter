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

//V0
// function renderMarker(noteData, workId, chapterId) {
//     // console.log("rendermarker", noteData.noteId)
//     const paragraphs = document.querySelectorAll("#workskin p");
//     const start = noteData.startParagraphIndex ?? 0;
//     const end = noteData.endParagraphIndex ?? 0;

//     // if (start >= end || end >= paragraphs.length) return;

//     // 1️⃣ 在起始段落开头插入 {
//     const startP = paragraphs[start];
//     const openBrace = document.createElement("span");
//     openBrace.dataset.noteId = noteData.noteId;//绑定noteid，之后更新会一起被删除！

//     openBrace.textContent = "{";
//     Object.assign(openBrace.style, {
//         color: "#880000",
//         // fontWeight: "bold",
//         fontSize: "20px",
//         fontStyle: "italic",
//         marginRight: "2px",
//         userSelect: "none"
//     });
//     startP.prepend(openBrace);

//     // 2️⃣ 在结束段落末尾插入 }
//     const endP = paragraphs[end];
//     const closeBrace = document.createElement("span");
//     closeBrace.dataset.noteId = noteData.noteId;

//     closeBrace.textContent = "}";
//     Object.assign(closeBrace.style, {
//         color: "#880000",
//         // fontWeight: "bold",
//         fontSize: "20px",
//         fontStyle: "italic",
//         marginLeft: "2px",
//         userSelect: "none"
//     });
//     endP.appendChild(closeBrace);


//     //
//     // 创建 marker + note 容器，noteid作为span的id
//     const noteContainer = document.createElement("span");
//     noteContainer.dataset.noteId = noteData.noteId;// ex.<span data-note-id="1234">

//     noteContainer.style.display = "inline-flex";
//     noteContainer.style.alignItems = "center";
//     // noteContainer.style.background = "#f0f0f0"; // 浅灰背景
//     noteContainer.style.borderRadius = "4px";
//     noteContainer.style.padding = "1px 4px";
//     noteContainer.style.marginLeft = "4px";
//     noteContainer.style.cursor = "pointer";
//     noteContainer.style.userSelect = "none";

//     // ✅ 仅当有 note 时加背景
//     if (noteData.note && noteData.note.trim() !== "") {
//         noteContainer.style.background = "#f0f0f0"; // 浅灰背景
//     }

//     // marker
//     const marker = document.createElement("span");
//     marker.textContent = noteData.marker || "❤️";
//     Object.assign(marker.style, {
//         fontStyle: "italic",
//         fontSize: "0.85em",
//         color: "#880000"
//     });
//     noteContainer.appendChild(marker);

//     // note（仅当有内容时）
//     if (noteData.note && noteData.note.trim() !== "") {
//         const noteSpan = document.createElement("span");
//         noteSpan.textContent = " " + noteData.note.trim();
//         Object.assign(noteSpan.style, {
//             fontStyle: "italic",
//             fontSize: "0.85em",
//             color: "#880000"
//         });
//         noteContainer.appendChild(noteSpan);
//     }

//     endP.appendChild(noteContainer);


//     // 3️⃣ 点击 marker 弹出底部面板

//     noteContainer.onclick = () => {//marker.onclick
//         // 移除已有面板
//         const existingPanel = document.getElementById("marker-bottom-panel");
//         if (existingPanel) existingPanel.remove();

//         const panel = document.createElement("div");
//         panel.id = "marker-bottom-panel";

//         Object.assign(panel.style, {
//             position: "fixed",
//             bottom: "0",
//             left: "0",
//             width: "100%",
//             maxHeight: "60%",        // 占屏幕下方50%-60%
//             background: "#fff",
//             borderTop: "1px solid #ccc",
//             borderRadius: "8px 8px 0 0",
//             zIndex: 9999,
//             display: "flex",
//             flexDirection: "column",
//             padding: "8px",
//             boxShadow: "0 -2px 6px rgba(0,0,0,0.2)",
//             overflow: "hidden"       // 面板内部 scroll
//         });


//         // ======= 上方提示 + help =======
//         const topRow = document.createElement("div");
//         Object.assign(topRow.style, {
//             display: "flex",
//             width: "98%",
//             justifyContent: "space-between",
//             alignItems: "center",
//             marginBottom: "4px"
//         });

//         // 上方原文提示
//         const contextDiv = document.createElement("div");
//         contextDiv.textContent = getContextText(noteData);
//         Object.assign(contextDiv.style, {
//             fontSize: "12px",
//             fontStyle: "italic",
//             color: "#888",
//             overflow: "hidden",
//             textOverflow: "ellipsis",
//             whiteSpace: "nowrap",
//             flex: "1" // 占满剩余空间
//         });

//         // 右侧 help 图标：点击显示内容，点击空白处关闭
//         // const helpIcon = document.createElement("span");
//         // helpIcon.textContent = " 𝒊 ";
//         // Object.assign(helpIcon.style, {
//         //     cursor: "help",
//         //     color: "#880000",
//         //     fontSize: "14px",
//         //     marginLeft: "6px",
//         //     flex: "0 0 auto" // 不拉伸
//         // });
//         // // helpIcon.title = "Save 保存，Delete 删除，Display 显示笔记";


//         // append 到同一行
//         topRow.appendChild(contextDiv);
//         topRow.appendChild(helpIcon);

//         // append 到面板上方
//         panel.appendChild(topRow);


//         // ===== 文本框（多行可滚动） =====
//         const input = document.createElement("textarea");
//         input.value = noteData.note || "";
//         Object.assign(input.style, {
//             flex: "1",              // 占据大部分高度
//             boxSizing: "border-box",  //padding + border + width=100%容易超出，指定包含 padding 和 border
//             width: "98%",
//             resize: "none",
//             fontSize: "14px",
//             padding: "6px",
//             overflowY: "auto",
//             marginBottom: "8px",
//             borderRadius: "4px",
//             border: "1px solid #ccc"
//         });

//         panel.appendChild(input);

//         // ===== 按钮行（靠右下） =====
//         const btnRow = document.createElement("div");
//         Object.assign(btnRow.style, {
//             display: "flex",
//             width: "98%",
//             justifyContent: "flex-end",//靠末尾
//             gap: "6px"
//         });

//         //----- save -----
//         const saveBtn = document.createElement("button");
//         saveBtn.textContent = "save";
//         Object.assign(saveBtn.style, {
//             cursor: "pointer",
//             color: "#880000",
//             fontSize: "14px",
//             opacity: 0.85,
//             padding: "4px 6px"
//         });
//         saveBtn.onclick = async () => {
//             noteData.note = input.value;
//             const noteSpan = document.createElement("span");//init notespan上面只有在note有内容的时候才会显示
//             noteSpan.textContent = input.value ? " " + input.value : "";
//             if (input.value) noteSpan.style.display = "inline";
//             await updateNote(noteData);
//             // 🔥 找旧  container
//             // const old = document.querySelector(
//             //     `[data-note-id="${noteData.noteId}"]`
//             // );
//             // if (old) old.remove();
//             // 寻找所有datasetnoteid=noteid的document元素删除
//             const old = document
//                 .querySelectorAll(`[data-note-id="${noteData.noteId}"]`)
//                 .forEach(el => el.remove());


//             // 🔥 重渲染
//             renderMarker(noteData, workId, chapterId);

//             panel.remove();
//         };



//         //-----delete-----
//         const delBtn = document.createElement("button");
//         delBtn.textContent = "delete";
//         Object.assign(delBtn.style, {
//             cursor: "pointer",
//             color: "#880000",
//             fontSize: "14px",
//             opacity: 0.85,
//             padding: "4px 6px"
//         });
//         delBtn.onclick = async () => {
//             openBrace.remove();
//             closeBrace.remove();
//             noteContainer.remove();
//             // marker.remove();
//             // noteSpan.remove();
//             await deleteNote(noteData.noteId);
//             panel.remove();
//         };

//         //-----dislpay-----
//         let showNote = true;
//         const showBtn = document.createElement("button");
//         showBtn.textContent = "display";
//         Object.assign(showBtn.style, {
//             cursor: "pointer",
//             color: "#880000",
//             fontSize: "14px",
//             opacity: 0.85,
//             padding: "4px 6px"
//         });
//         showBtn.onclick = () => {
//             showNote = !showNote;
//             const hasNote = noteData.note && noteData.note.trim() !== "";
//             noteSpan.style.display = showNote && hasNote ? "inline" : "none";
//         };

//         btnRow.appendChild(saveBtn);
//         btnRow.appendChild(delBtn);
//         btnRow.appendChild(showBtn);
//         // btnRow.appendChild(helpIcon);

//         panel.appendChild(btnRow);

//         document.body.appendChild(panel);

//         // 点击面板外关闭
//         const closePanel = (e) => {
//             if (!panel.contains(e.target) && e.target !== marker) {
//                 panel.remove();
//                 document.removeEventListener("mousedown", closePanel);
//             }
//         };
//         document.addEventListener("mousedown", closePanel);
//     };
// }


// =======================================
// 1️⃣ 渲染 DOM
// =======================================

function renderMarkerUI(noteData) {
    const paragraphs = document.querySelectorAll("#workskin p");
    const startP = paragraphs[noteData.startParagraphIndex ?? 0];
    const endP = paragraphs[noteData.endParagraphIndex ?? 0];

    if (!startP || !endP) return;

    // ----- { -----
    const openBrace = document.createElement("span");
    openBrace.textContent = "{";
    openBrace.dataset.noteId = noteData.noteId;
    Object.assign(openBrace.style, { color: "#880000", fontSize: "20px", marginRight: "2px" });
    startP.prepend(openBrace);

    // ----- } -----
    const closeBrace = document.createElement("span");
    closeBrace.textContent = "}";
    closeBrace.dataset.noteId = noteData.noteId;
    Object.assign(closeBrace.style, { color: "#880000", fontSize: "20px", marginLeft: "2px" });
    endP.appendChild(closeBrace);


    // ----- marker -----
    const marker = document.createElement("span");
    marker.textContent = noteData.marker || "❤️";
    marker.dataset.noteId = noteData.noteId;
    Object.assign(marker.style, { cursor: "pointer", color: "#880000", marginLeft: "4px" });
    endP.appendChild(marker);

    // ----- noteSpan -----
    const noteSpan = document.createElement("span");
    noteSpan.dataset.noteId = noteData.noteId;
    noteSpan.className = "ao3-note-text";

    if (!noteData.note || noteData.note.trim() === "") {
        noteSpan.textContent = " leave a note";
        Object.assign(noteSpan.style, {
            fontStyle: "italic",
            color: "#888",
            backgroundColor: "#fff",
            marginLeft: "4px",
            cursor: "text",
        });
        noteSpan.dataset.placeholder = "true"; // 占位标识
    } else {
        noteSpan.textContent = " " + noteData.note.trim();
        Object.assign(noteSpan.style, {
            fontStyle: "italic",
            color: "#880000",
            backgroundColor: "#f0f0f0",
            marginLeft: "6px",
            cursor: "text",
        });
        noteSpan.dataset.placeholder = "false";
    }

    endP.appendChild(noteSpan);

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
            await updateNote(noteData);//直接更新该notedata所以不用指定id!!

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



// //🔹 marker 点击菜单
// function bindMarkerMenu(marker, noteSpan, noteData) {
//     marker.onclick = (e) => {
//         e.stopPropagation();

//         const menu = document.createElement("div");
//         menu.style.position = "absolute";
//         menu.style.background = "#fff";
//         menu.style.border = "1px solid #ccc";
//         menu.style.padding = "4px";
//         menu.style.borderRadius = "4px";
//         menu.style.zIndex = 9999;

//         const delBtn = document.createElement("button");
//         delBtn.textContent = "delete";
//         delBtn.onclick = async () => {
//             await deleteNote(noteData.noteId);
//             [marker, noteSpan].forEach(el => el.remove());
//             menu.remove();
//         };

//         const toggleBtn = document.createElement("button");
//         toggleBtn.textContent = "display text";
//         toggleBtn.style.marginLeft = "4px";
//         toggleBtn.onclick = () => {
//             noteSpan.style.display = noteSpan.style.display === "none" ? "inline" : "none";
//             menu.remove();
//         };

//         menu.appendChild(delBtn);
//         menu.appendChild(toggleBtn);
//         document.body.appendChild(menu);

//         const rect = marker.getBoundingClientRect();
//         menu.style.top = `${rect.bottom + window.scrollY}px`;
//         menu.style.left = `${rect.left + window.scrollX}px`;

//         document.addEventListener("mousedown", function closeMenu(event) {
//             if (!menu.contains(event.target) && event.target !== marker) {
//                 menu.remove();
//                 document.removeEventListener("mousedown", closeMenu);
//             }
//         });
//     };
// }

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
        const delBtn = document.createElement("span");
        delBtn.textContent = "delete";
        Object.assign(delBtn.style, {
            // padding: "4px",
            color: "#880000",
            fontSize: "13px"

        });

        delBtn.onclick = async () => {
            await deleteNote(noteData.noteId);
            const allEls = document.querySelectorAll(`[data-note-id="${noteData.noteId}"]`);
            allEls.forEach(el => el.remove());
            menu.remove();
            await deleteNote(noteData.noteId);


        };
        menu.appendChild(delBtn);

        // 显示/隐藏
        const toggleBtn = document.createElement("span");
        toggleBtn.textContent = "/ display text";
        Object.assign(toggleBtn.style, {
            // padding: "4px",
            color: "#880000",
            fontSize: "13px",
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
// 4️⃣ 删除 / 显示逻辑封装
// =======================================
// function bindNoteControls(noteContainer, noteData, workId, chapterId) {

//     // 右键删除 marker 或者增加按钮
//     noteContainer.addEventListener("contextmenu", async (e) => {
//         e.preventDefault();
//         await deleteNote(noteData.noteId);
//         refreshNote(noteData, workId, chapterId);
//     });

//     // 可扩展显示/隐藏逻辑
//     // noteData.hidden = false/true
// }

// =======================================
// 5️⃣ 主渲染函数
// =======================================

function renderMarker(noteData, workId, chapterId) {
    const { marker, noteSpan } = renderMarkerUI(noteData); // ✅ 拿到 noteSpan

    enableInlineEdit(noteSpan, noteData); // 传入 noteSpan
    bindMarkerMenu(marker, noteSpan, noteData); // 绑定 marker 菜单
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
        gap: "4px"              // 间距
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
        note: "",
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
function scrollToNote(note) {

    const paragraphs = document.querySelectorAll("#workskin p");
    if (!paragraphs.length) return;

    // ⭐ 兼容旧数据（没有 startIndex）
    const start = note.startParagraphIndex ?? note.endParagraphIndex;
    const end = note.endParagraphIndex;

    if (start == null || end == null) return;

    const from = Math.min(start, end);
    const to = Math.max(start, end);

    // ⭐ 滚动到中间位置（更自然）
    const mid = paragraphs[Math.floor((from + to) / 2)];
    if (!mid) return;

    mid.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    // ⭐ 高亮范围
    const highlighted = [];

    for (let i = from; i <= to; i++) {

        const p = paragraphs[i];
        if (!p) continue;

        p.style.transition = "background 0.6s";
        p.style.background = "#fff2a8";

        highlighted.push(p);
    }

    // ⭐ 自动取消高亮
    setTimeout(() => {
        highlighted.forEach(p => {
            p.style.background = "";
        });
    }, 1500);
}



async function showNotesSummary(workId, currentChapterId) {
    // 如果 panel 已存在，直接返回
    // if (document.getElementById("notes-panel")) return;

    // ✅ 删除已有面板
    const existingPanel = document.getElementById("notes-panel");
    if (existingPanel) existingPanel.remove();

    // 没有则创建面板
    const panel = document.createElement("div");
    panel.id = "notes-panel";
    Object.assign(panel.style, {
        position: "fixed",
        top: "0",
        right: "0",
        height: "100%",
        width: "90%",           // 右侧90%屏幕
        maxWidth: "400px",
        background: "#f8f8f8",
        boxShadow: "-2px 0 6px rgba(0,0,0,0.2)",
        zIndex: 99999,
        padding: "12px",
        overflowY: "auto",
        fontFamily: "sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: "12px"
    });

    // ===== 大标题 =====
    const titleEl = document.createElement("h2");
    titleEl.textContent = "My Notes";
    Object.assign(titleEl.style, {
        margin: "0 0 4px 0",
        color: "#880000",
        fontSize: "20px",
        fontWeight: "bold"
    });
    panel.appendChild(titleEl);

    // ===== 作品信息 =====
    const notes = await loadNotesByWork(workId); // 返回该作品所有 noteData 数组
    const author = notes[0]?.author || "Unknown";
    const fandom = notes[0]?.fandom || "Unknown";
    const workTitle = notes[0]?.title || "Untitled";
    const totalNotes = notes.length;

    const infoEl = document.createElement("div");
    infoEl.textContent = `${fandom} | ${workTitle} | ${author} | ${totalNotes} note${totalNotes !== 1 ? "s" : ""}`;
    Object.assign(infoEl.style, {
        fontSize: "14px",
        color: "#404040", //"#555",//深灰色字体
        marginBottom: "8px"
    });
    panel.appendChild(infoEl);


    //========搜索栏=========

    // ===== 按章节分组 =====
    const chaptersMap = {};
    notes.forEach(note => {
        if (!chaptersMap[note.chapterId]) chaptersMap[note.chapterId] = { name: note.chapterName, notes: [] };
        chaptersMap[note.chapterId].notes.push(note);
    });

    for (const chapterId in chaptersMap) {
        const chapter = chaptersMap[chapterId];

        // ===== 章节标题 =====
        const chapterHeader = document.createElement("div");
        chapterHeader.textContent = chapter.name;
        Object.assign(chapterHeader.style, {
            // fontWeight: "bold",
            fontSize: "16px",
            color: "#404040",//"#880000",
            cursor: "pointer",
            marginTop: "12px",
            marginBottom: "4px",
            borderBottom: "1px solid #ccc",
            paddingBottom: "2px"
        });

        // ===== 章节内容容器（折叠） =====
        const chapterContent = document.createElement("div");
        chapterContent.style.display = chapterId === currentChapterId ? "block" : "none"; // 默认展开当前章节
        chapterContent.style.flexDirection = "column";
        chapterContent.style.gap = "6px";
        chapterContent.style.marginLeft = "6px";


        // 点击章节标题切换折叠
        chapterHeader.onclick = () => {
            chapterContent.style.display = chapterContent.style.display === "none" ? "block" : "none";
        };

        // ===== 笔记内容 =====
        chapter.notes.forEach(note => {
            // TEXTEL 显示原文预览：截取中间部分显示前后各 10 个字符
            const fullText = note.text || "";

            // 创建显示元素
            const textEl = document.createElement("span");
            textEl.textContent = fullText;

            // 显示预览文本呢
            // const previewText = fullText.length > 24
            //     ? fullText.slice(0, 10) + "…" + fullText.slice(-10)
            //     : fullText;
            // textEl.textContent = previewText;
            // Object.assign(textEl.style, {
            //     fontSize: "14px",
            //     color: "#555",
            //     lineHeight: "1.4em",
            //     marginRight: "6px" // 给箭头留点间距
            // });

            // // 是否显示原文的状态
            // let showingFull = false;

            // // 创建展开按钮
            // const expandBtn = document.createElement("span");
            // expandBtn.textContent = " [more] ";//"↓";
            // Object.assign(expandBtn.style, {
            //     cursor: "pointer",
            //     color: "#555",
            //     fontSize: "10px",
            //     userSelect: "none"
            // });

            // // 点击切换
            // expandBtn.onclick = () => {
            //     if (!showingFull) {
            //         textEl.textContent = fullText;
            //         expandBtn.textContent = " [less] "; // 变成向上箭头表示可以收起
            //         showingFull = true;
            //     } else {
            //         textEl.textContent = previewText;
            //         expandBtn.textContent = " [more] ";
            //         showingFull = false;
            //     }
            // };

            // 将文本和按钮添加到容器
            const container = document.createElement("span"); // span 默认行内
            container.appendChild(textEl);
            // container.appendChild(expandBtn);
            chapterContent.appendChild(container);


            //-----------点击原文内容跳转----------
            textEl.style.cursor = "pointer";
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




            // NOTEEL 笔记内容
            const noteEl = document.createElement("div");
            noteEl.style.display = "flex";
            noteEl.style.flexDirection = "column";
            noteEl.style.gap = "2px";

            const noteContent = document.createElement("span");
            noteContent.textContent = note.note || "";
            Object.assign(noteContent.style, {
                fontSize: "13px",
                fontStyle: "italic",
                color: "#880000",
                // background: "#f0f0f0",
                padding: "1px 3px",
                borderRadius: "3px",
                lineHeight: "1.4em",
                display: note.note && note.note.trim() !== "" ? "inline-block" : "none"
            });

            // 笔记修改入口2

            // noteEl.appendChild(textEl);
            noteEl.appendChild(noteContent);
            chapterContent.appendChild(noteEl);

            //padding around every note
            // 外层容器，包裹一条笔记
            const noteWrapper = document.createElement("div");
            noteWrapper.style.marginBottom = "12px"; // 行间距：12px
            chapterContent.appendChild(noteWrapper);



        });

        panel.appendChild(chapterHeader);
        panel.appendChild(chapterContent);
    }

    // ===== 添加关闭按钮 =====
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

    document.body.appendChild(panel);

}



// ======= 📑 Marker & Panel Demo =======
// 创建右上角 panelmarker
const panelMarker = document.createElement("span");

panelMarker.textContent = "🗎",// MARKER_CLOSED;   // 初始默认折角
    Object.assign(panelMarker.style, {
        position: "fixed",
        top: "10px",
        right: "10px",
        fontStyle: "bold",
        fontSize: "24px",
        color: "#880000",
        cursor: "pointer",
        zIndex: 99999//数字越大，越顶层
    });
document.body.appendChild(panelMarker);

panelMarker.onclick = async () => {
    if (document.getElementById("notes-panel")) return;

    const workId = getWorkId();
    const currentChapterId = getCurrentChapter().id;

    await showNotesSummary(workId, currentChapterId);
};




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



//---------------- 页面加载时重新渲染marker----------------

window.addEventListener("load", async () => {
    const workId = getWorkId();
    const currentChapterId = getCurrentChapter().id

    // const chapterId = getCurrentChapterID(); // 当前章节
    await renderNotesForChapter(workId, currentChapterId);


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

// //------------------跳转后有jumpToNote临时保存则scroll-------------------
// window.addEventListener("load", async () => {

//     // ===== 1️⃣ 正常渲染 markers =====
//     const workId = getWorkId();
//     const notes = await loadNotesByWork(workId);
//     notes.forEach(n => renderMarker(n, n.workId, n.chapterId));


//     // ===== 2️⃣ 检查是否有跳转定位 =====
//     const pending = sessionStorage.getItem("jumpToNote");

//     if (pending) {

//         sessionStorage.removeItem("jumpToNote");

//         const note = JSON.parse(pending);

//         // ⭐ 等 AO3 页面完全布局好再滚动
//         setTimeout(() => {
//             scrollToNote(note);
//         }, 350);
//     }

// });
