document.addEventListener('DOMContentLoaded', () => {
  const DB_NAME = 'webAssistantDB';
  const DB_VERSION = 1; // 应与 background.js 中的版本一致
  const STORE_USAGE_RECORDS = 'usageRecords';
  const STORE_VOCABULARY = 'vocabulary';

  let db;

  const exportMarkdownBtn = document.getElementById('exportMarkdownBtn');

  async function getVocabularyData() {
    if (!db) await openDB(); //确保数据库已打开
    const transaction = db.transaction([STORE_VOCABULARY], 'readonly');
    const store = transaction.objectStore(STORE_VOCABULARY);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []); // 如果结果是 undefined，返回空数组
      request.onerror = () => reject(request.error);
    });
  }

  async function exportVocabularyToMarkdown() {
    try {
      const words = await getVocabularyData();
      if (!words || words.length === 0) {
        alert('单词本是空的，无法导出。');
        return;
      }

      let markdownContent = "# 我的单词本\n\n";
      markdownContent += "| 单词 | 添加日期 | 复习次数 | 释义 | 例句 |\n";
      markdownContent += "|---|---|---|---|---|\n";

      words.sort((a,b) => new Date(b.addedDate) - new Date(a.addedDate)); 

      words.forEach(word => {
        const wordValue = word.word || '';
        const addedDate = word.addedDate ? new Date(word.addedDate).toLocaleDateString() : '-';
        const reviewCount = word.reviewCount !== undefined ? word.reviewCount : 0; 
        const definition = word.definition || '-';
        const exampleSentence = word.exampleSentence || '-';
        
        const escapeMarkdown = (text) => {
            if (typeof text !== 'string' && typeof text !== 'number') { 
                return '-'; 
            }
            return text.toString().replace(/\|/g, '\\\\|').replace(/\n/g, '<br>');
        };

        markdownContent += `| ${escapeMarkdown(wordValue)} | ${addedDate} | ${reviewCount} | ${escapeMarkdown(definition)} | ${escapeMarkdown(exampleSentence)} |\n`;
      });

      const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my_vocabulary.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("导出 Markdown 失败:", error);
      alert("导出 Markdown 失败，请查看控制台获取更多信息。");
    }
  }

  if (exportMarkdownBtn) {
    exportMarkdownBtn.addEventListener('click', exportVocabularyToMarkdown);
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = (event) => reject("数据库错误: " + event.target.errorCode);
      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };
      // onupgradeneeded 通常在 background.js 中处理，这里假设数据库和表已创建
      request.onupgradeneeded = (event) => {
        // Options page 通常不应该创建或升级数据库结构，这应该是 background script 的责任。
        // 但为了健壮性，可以简单地记录一下，或者尝试与 background.js 一致的创建逻辑。
        console.log("数据库升级事件在 options page 触发，通常这不应该发生。确保 background.js 先运行并创建了数据库结构。");
        // 为了避免潜在问题，这里我们不主动创建表，依赖 background.js
        // const tempDb = event.target.result;
        // if (!tempDb.objectStoreNames.contains(STORE_USAGE_RECORDS)) { ... }
        // if (!tempDb.objectStoreNames.contains(STORE_VOCABULARY)) { ... }
      };
    });
  }

  async function loadUsageRecords() {
    if (!db) await openDB();
    const transaction = db.transaction([STORE_USAGE_RECORDS], 'readonly');
    const store = transaction.objectStore(STORE_USAGE_RECORDS);
    const records = await store.getAll(); // 使用 getAll() 的 Promise 版本

    const tbody = document.querySelector('#usageRecordsTable tbody');
    const noRecordsP = document.getElementById('noUsageRecords');
    tbody.innerHTML = ''; // 清空现有行

    if (records && records.length > 0) {
      noRecordsP.style.display = 'none';
      records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // 按时间倒序
      records.forEach(record => {
        const row = tbody.insertRow();
        row.insertCell().textContent = new Date(record.timestamp).toLocaleString();
        row.insertCell().textContent = record.action;
        row.insertCell().textContent = record.textSnippet ? record.textSnippet.substring(0, 100) : ''; // 防止 textSnippet 为空
      });
    } else {
      noRecordsP.style.display = 'block';
    }
  }

  async function loadVocabulary() {
    if (!db) await openDB();
    const transaction = db.transaction([STORE_VOCABULARY], 'readonly');
    const store = transaction.objectStore(STORE_VOCABULARY);
    const words = await store.getAll(); // 使用 getAll() 的 Promise 版本

    const tbody = document.querySelector('#vocabularyTable tbody');
    const noVocabularyP = document.getElementById('noVocabulary');
    tbody.innerHTML = ''; // 清空现有行

    if (words && words.length > 0) {
      noVocabularyP.style.display = 'none';
      words.sort((a,b) => new Date(b.addedDate) - new Date(a.addedDate)); // 按添加日期倒序
      words.forEach(word => {
        const row = tbody.insertRow();
        row.insertCell().textContent = word.word;
        row.insertCell().textContent = new Date(word.addedDate).toLocaleDateString();
        row.insertCell().textContent = word.definition || 'N/A';
        row.insertCell().textContent = word.exampleSentence || 'N/A';
        row.insertCell().textContent = word.reviewCount;
      });
    } else {
      noVocabularyP.style.display = 'block';
    }
  }

  // 初始化：打开数据库并加载数据
  openDB().then(() => {
    loadUsageRecords();
    loadVocabulary();
  }).catch(error => {
    console.error("打开数据库失败:", error);
    document.getElementById('noUsageRecords').textContent = '无法加载使用记录，数据库连接失败。';
    document.getElementById('noUsageRecords').style.display = 'block';
    document.getElementById('noVocabulary').textContent = '无法加载单词本，数据库连接失败。';
    document.getElementById('noVocabulary').style.display = 'block';
  });

  // 针对 getAll() 的 Promise 封装 (如果浏览器原生不支持 Promise-based getAll)
  // 大多数现代浏览器已经支持了，但为了兼容性可以保留
  // 为 objectStore 添加一个 getAll 的 Promise 包装，如果它不存在
  if (IDBObjectStore.prototype.getAll === undefined || IDBRequest.prototype.then === undefined) {
    IDBObjectStore.prototype.getAll = IDBObjectStore.prototype.getAll || function() {
      const store = this;
      return new Promise(function(resolve, reject) {
        const req = store.openCursor(); // 或者直接用 getAll() 如果支持，但这里我们假设它不存在或者要封装的是游标
        const results = [];
        req.onsuccess = function(event) {
          const cursor = event.target.result;
          if (cursor) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = function(event) {
          reject(event.target.error);
        };
      });
    };
    // 也为 IDBRequest 添加 then, catch, finally 以便像 Promise 一样使用
    // 这个只是一个非常简化的 Promise-like 行为添加，实际中可能需要更完整的 polyfill
    IDBRequest.prototype.then = IDBRequest.prototype.then || function(onSuccess, onError) {
        return new Promise((resolve, reject) => {
            this.onsuccess = event => resolve(onSuccess ? onSuccess(event.target.result) : event.target.result);
            this.onerror = event => reject(onError ? onError(event.target.error) : event.target.error);
        });
    };
  }

}); 